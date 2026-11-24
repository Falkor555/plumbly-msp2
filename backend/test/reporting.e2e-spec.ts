import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReportingModule } from '../src/reporting/reporting.module.js';
import { ReportingRepository } from '../src/reporting/reporting.repository.js';
import { ReportingService } from '../src/reporting/reporting.service.js';

// Période assez large pour couvrir le seed, dont les tournées sont datées d'aujourd'hui et de demain.
const TOUTE_LA_PERIODE = { du: '2000-01-01', au: '2100-12-31' };
const NOMBRE_INTERVENTIONS_DU_SEED = 9;

/** Remplit la base de test avec le seed de l'application (prisma/seed.ts), tel qu'en développement. */
function lancerLeSeed(): void {
  execFileSync(process.execPath, ['prisma/seed.ts'], {
    env: {
      ...process.env,
      // Mot de passe tiré au hasard : aucun secret n'est écrit dans le dépôt.
      SEED_MOT_DE_PASSE: randomBytes(16).toString('hex'),
    },
    stdio: 'pipe',
  });
}

/** Date AAAA-MM-JJ d'une colonne DATE lue par Prisma (minuit UTC). */
function enDateCalendaire(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe('requêtes SQL de reporting', () => {
  let prisma: PrismaService;
  let depot: ReportingRepository;
  let service: ReportingService;

  beforeAll(async () => {
    lancerLeSeed();
    const module = await Test.createTestingModule({
      imports: [PrismaModule, ReportingModule],
    }).compile();
    await module.init();
    prisma = module.get(PrismaService);
    depot = module.get(ReportingRepository);
    service = module.get(ReportingService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function trouverTechnicien(email: string): Promise<number> {
    const technicien = await prisma.technicien.findFirstOrThrow({
      where: { utilisateur: { email } },
    });
    return technicien.id;
  }

  describe('nombre d’interventions par technicien et par statut', () => {
    it('compte les interventions de chaque technicien actif, statut par statut', async () => {
      const lignes = await service.compterInterventionsParTechnicienEtStatut(TOUTE_LA_PERIODE);

      expect(lignes).toEqual([
        expect.objectContaining({
          nom: 'Grondin',
          prenom: 'Mathieu',
          total: 2,
          aPlanifier: 0,
          planifiees: 2,
          enCours: 0,
          terminees: 0,
          annulees: 0,
        }),
        expect.objectContaining({
          nom: 'Hoarau',
          prenom: 'Kévin',
          total: 3,
          planifiees: 1,
          enCours: 1,
          terminees: 1,
        }),
        // Sans tournée sur la période : présente avec des compteurs à zéro (LEFT JOIN).
        expect.objectContaining({ nom: 'Técher', prenom: 'Sarah', total: 0 }),
      ]);
    });

    it('écarte le technicien archivé', async () => {
      const lignes = await service.compterInterventionsParTechnicienEtStatut(TOUTE_LA_PERIODE);

      expect(lignes.map((ligne) => ligne.nom)).not.toContain('Robert');
    });

    it('renvoie des compteurs à zéro sur une période sans tournée', async () => {
      const lignes = await service.compterInterventionsParTechnicienEtStatut({
        du: '2001-01-01',
        au: '2001-12-31',
      });

      expect(lignes).toHaveLength(3);
      expect(lignes.every((ligne) => ligne.total === 0)).toBe(true);
    });
  });

  describe('tournée détaillée d’un technicien', () => {
    it('renvoie les étapes dans l’ordre de passage, avec client, adresse et type', async () => {
      const idKevin = await trouverTechnicien('kevin.hoarau@plumbly.test');
      const tournee = await prisma.tournee.findFirstOrThrow({ where: { idTechnicien: idKevin } });
      const date = enDateCalendaire(tournee.dateTournee);

      const detail = await service.detaillerTournee(idKevin, date);

      expect(detail).toMatchObject({
        idTournee: tournee.id,
        dateTournee: date,
        nomTechnicien: 'Hoarau',
        prenomTechnicien: 'Kévin',
      });
      expect(
        detail?.etapes.map(({ ordre, client, ville, typeIntervention, statut }) => ({
          ordre,
          client,
          ville,
          typeIntervention,
          statut,
        })),
      ).toEqual([
        {
          ordre: 1,
          client: 'Josiane Hoareau',
          ville: 'Saint-Denis',
          typeIntervention: 'Recherche de fuite',
          statut: 'TERMINEE',
        },
        {
          ordre: 2,
          client: 'Boulangerie du Barachois',
          ville: 'Saint-Denis',
          typeIntervention: 'Débouchage de canalisation',
          statut: 'EN_COURS',
        },
        {
          ordre: 3,
          client: 'Didier Maillot',
          ville: 'Le Tampon',
          typeIntervention: 'Entretien de chauffe-eau solaire',
          statut: 'PLANIFIEE',
        },
      ]);
    });

    it('calcule la fin prévue à partir du début et de la durée estimée', async () => {
      const idKevin = await trouverTechnicien('kevin.hoarau@plumbly.test');
      const tournee = await prisma.tournee.findFirstOrThrow({ where: { idTechnicien: idKevin } });

      const detail = await service.detaillerTournee(idKevin, enDateCalendaire(tournee.dateTournee));

      for (const etape of detail?.etapes ?? []) {
        const dureeMs = etape.finPrevue.getTime() - etape.debutPrevu.getTime();
        expect(dureeMs).toBe(etape.dureeEstimeeMin * 60_000);
      }
    });

    it('renvoie null quand le technicien n’a pas de tournée ce jour-là', async () => {
      const idSarah = await trouverTechnicien('sarah.techer@plumbly.test');

      const detail = await service.detaillerTournee(idSarah, '2026-11-24');

      expect(detail).toBeNull();
    });

    it('renvoie une tournée sans étape quand elle ne contient aucune intervention', async () => {
      const idSarah = await trouverTechnicien('sarah.techer@plumbly.test');
      const gestionnaire = await prisma.utilisateur.findUniqueOrThrow({
        where: { email: 'gestion@plumbly.test' },
      });
      const vide = await prisma.tournee.create({
        data: {
          idTechnicien: idSarah,
          idCreateur: gestionnaire.id,
          dateTournee: new Date('2030-01-02T00:00:00Z'),
        },
      });

      try {
        const detail = await service.detaillerTournee(idSarah, '2030-01-02');

        expect(detail).toMatchObject({ idTournee: vide.id, dateTournee: '2030-01-02', etapes: [] });
      } finally {
        await prisma.tournee.delete({ where: { id: vide.id } });
      }
    });
  });

  describe('temps moyen de traitement', () => {
    it('compare la durée réelle sur place à la durée estimée, par type et en tout', async () => {
      const temps = await service.calculerTempsMoyenDeTraitement(TOUTE_LA_PERIODE);

      // Seed : une seule intervention terminée, démarrée à 8 h 05 et finie à 8 h 50 (60 min estimées).
      expect(temps).toEqual({
        parType: [
          {
            typeIntervention: 'Recherche de fuite',
            nombreInterventions: 1,
            dureeMoyenneMin: 45,
            dureeEstimeeMoyenneMin: 60,
          },
        ],
        ensemble: { nombreInterventions: 1, dureeMoyenneMin: 45, dureeEstimeeMoyenneMin: 60 },
      });
    });

    it('renvoie un ensemble vide sur une période sans intervention terminée', async () => {
      const temps = await service.calculerTempsMoyenDeTraitement({
        du: '2001-01-01',
        au: '2001-12-31',
      });

      expect(temps).toEqual({
        parType: [],
        ensemble: { nombreInterventions: 0, dureeMoyenneMin: null, dureeEstimeeMoyenneMin: null },
      });
    });

    it('rattache une intervention finie à 1 h 30 du matin au jour de La Réunion, pas au jour UTC', async () => {
      // 2030-03-09 à 21 h 30 UTC = 2030-03-10 à 1 h 30 à La Réunion (UTC+4).
      const idSarah = await trouverTechnicien('sarah.techer@plumbly.test');
      const gestionnaire = await prisma.utilisateur.findUniqueOrThrow({
        where: { email: 'gestion@plumbly.test' },
      });
      const adresse = await prisma.adresse.findFirstOrThrow({ where: { archive: false } });
      const type = await prisma.typeIntervention.findUniqueOrThrow({
        where: { libelle: 'Réparation de robinetterie' },
      });
      const tournee = await prisma.tournee.create({
        data: {
          idTechnicien: idSarah,
          idCreateur: gestionnaire.id,
          dateTournee: new Date('2030-03-10T00:00:00Z'),
          interventions: {
            create: {
              description: 'Dépannage de nuit.',
              urgence: 'URGENTE',
              statut: 'TERMINEE',
              dureeEstimeeMin: 45,
              ordreTournee: 1,
              debutPrevu: new Date('2030-03-09T20:30:00Z'),
              demarreeLe: new Date('2030-03-09T20:30:00Z'),
              termineeLe: new Date('2030-03-09T21:30:00Z'),
              idAdresse: adresse.id,
              idTypeIntervention: type.id,
              idCreateur: gestionnaire.id,
            },
          },
        },
      });

      try {
        const jourReunion = await service.calculerTempsMoyenDeTraitement({
          du: '2030-03-10',
          au: '2030-03-10',
        });
        const jourUtc = await service.calculerTempsMoyenDeTraitement({
          du: '2030-03-09',
          au: '2030-03-09',
        });

        expect(jourReunion.ensemble).toEqual({
          nombreInterventions: 1,
          dureeMoyenneMin: 60,
          dureeEstimeeMoyenneMin: 45,
        });
        expect(jourUtc.ensemble.nombreInterventions).toBe(0);
      } finally {
        await prisma.intervention.deleteMany({ where: { idTournee: tournee.id } });
        await prisma.tournee.delete({ where: { id: tournee.id } });
      }
    });
  });

  describe('protection contre l’injection SQL', () => {
    // Ces tests appellent directement le repository, sans la validation du service, pour montrer
    // que la requête paramétrée suffit à elle seule : la chaîne arrive à PostgreSQL comme une valeur.
    it('traite une date piégée comme une valeur : la requête échoue et aucune table n’est supprimée', async () => {
      const idKevin = await trouverTechnicien('kevin.hoarau@plumbly.test');
      const datePiegee = "2026-11-24'; DROP TABLE intervention; --";

      const appel = depot.detaillerTournee(idKevin, datePiegee);

      // PostgreSQL tente de lire toute la chaîne comme une date et la refuse (code 22007).
      await expect(appel).rejects.toThrow(/invalid input syntax for type date/);
      expect(await prisma.intervention.count()).toBe(NOMBRE_INTERVENTIONS_DU_SEED);
    });

    it('ne laisse pas une condition toujours vraie élargir le résultat', async () => {
      const idKevin = await trouverTechnicien('kevin.hoarau@plumbly.test');
      const tournee = await prisma.tournee.findFirstOrThrow({ where: { idTechnicien: idKevin } });
      const datePiegee = `${enDateCalendaire(tournee.dateTournee)}' OR '1'='1`;

      const appel = depot.compterInterventionsParTechnicienEtStatut({
        du: datePiegee,
        au: datePiegee,
      });

      await expect(appel).rejects.toThrow(/invalid input syntax for type date/);
    });

    it('refuse la date piégée dès le service, avant la base', async () => {
      const idKevin = await trouverTechnicien('kevin.hoarau@plumbly.test');

      const appel = service.detaillerTournee(idKevin, "2026-11-24'; DROP TABLE intervention; --");

      await expect(appel).rejects.toThrow(/Date invalide/);
    });
  });
});
