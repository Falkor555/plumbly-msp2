import { PrismaService } from '../src/prisma/prisma.service.js';

// Tables du MLD (docs/modele-donnees.md, section 4.2).
const TABLES_DU_MLD = [
  'adresse',
  'client',
  'indisponibilite',
  'intervention',
  'jeton_rafraichissement',
  'jeton_reinitialisation',
  'technicien',
  'tournee',
  'type_intervention',
  'utilisateur',
];

describe('schéma Prisma appliqué à PostgreSQL', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('crée toutes les tables du MLD', async () => {
    const lignes = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;

    expect(lignes.map((ligne) => ligne.table_name)).toEqual(TABLES_DU_MLD);
  });

  it('stocke une date en UTC sans décalage, alors que la base tourne en Indian/Reunion', async () => {
    const instant = new Date('2026-12-01T04:00:00.000Z'); // 8 h 00 à La Réunion
    const utilisateur = await prisma.utilisateur.create({
      data: {
        email: 'fuseau@plumbly.test',
        motDePasseHash: 'sans-importance-pour-ce-test',
        nom: 'Fuseau',
        prenom: 'Test',
        role: 'GESTIONNAIRE',
        derniereConnexion: instant,
      },
    });

    try {
      const [brut] = await prisma.$queryRaw<{ utc: string }[]>`
        SELECT to_char(derniere_connexion AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS utc
        FROM utilisateur WHERE id_utilisateur = ${utilisateur.id}`;
      const relu = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateur.id } });

      expect(brut.utc).toBe('2026-12-01T04:00');
      expect(relu.derniereConnexion).toEqual(instant);
    } finally {
      await prisma.utilisateur.delete({ where: { id: utilisateur.id } });
    }
  });
});
