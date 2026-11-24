import { lireUrlBase, PrismaService } from './prisma.service.js';

const URL_FICTIVE = 'postgresql://utilisateur:secret@hote-inexistant:5432/plumbly';

describe('lireUrlBase', () => {
  it("renvoie l'URL définie dans DATABASE_URL", () => {
    const env = { DATABASE_URL: URL_FICTIVE };

    const url = lireUrlBase(env);

    expect(url).toBe(URL_FICTIVE);
  });

  it.each([
    ['absente', {}],
    ['vide', { DATABASE_URL: '' }],
    ['faite uniquement d’espaces', { DATABASE_URL: '   ' }],
  ])('refuse une DATABASE_URL %s avec un message qui indique où la définir', (_cas, env) => {
    expect(() => lireUrlBase(env)).toThrow(/DATABASE_URL manquante.*\.env/);
  });
});

describe('PrismaService', () => {
  let urlAvantTest: string | undefined;

  beforeEach(() => {
    urlAvantTest = process.env.DATABASE_URL;
    process.env.DATABASE_URL = URL_FICTIVE;
  });

  afterEach(() => {
    process.env.DATABASE_URL = urlAvantTest;
    vi.restoreAllMocks();
  });

  it('vérifie la base au démarrage du module', async () => {
    const service = new PrismaService();
    const requete = vi.spyOn(service, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);

    await service.onModuleInit();

    expect(requete).toHaveBeenCalledTimes(1);
  });

  it("empêche le démarrage si la base est injoignable, sans exposer l'URL de connexion", async () => {
    const service = new PrismaService();
    const panne = new Error('connect ECONNREFUSED');
    vi.spyOn(service, '$queryRaw').mockRejectedValue(panne);

    const demarrage = service.onModuleInit();

    await expect(demarrage).rejects.toThrow(/Connexion à PostgreSQL impossible/);
    await expect(demarrage).rejects.toMatchObject({ cause: panne });
    await expect(demarrage).rejects.not.toThrow(/secret/);
  });
});
