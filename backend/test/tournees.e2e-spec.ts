import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type {
  RequeteAuthentifiee,
  UtilisateurConnecte,
} from '../src/commun/autorisation/utilisateur-connecte.js';
import { Horloge } from '../src/commun/horloge.js';
import { StatutIntervention, Urgence } from '../src/generated/prisma/client.ts';
import { JournalDesActions } from '../src/journal/journal-des-actions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/*
 * Tests d'intégration de la planification (issue #19) : routes HTTP, règles de gestion et
 * contraintes PostgreSQL ensemble, sur la base éphémère de Testcontainers.
 *
 * L'authentification JWT (card #13) n'existe pas encore : un middleware de test place
 * l'utilisateur dans request.user, exactement là où la stratégie JWT le mettra. Les gardes
 * de rôle testés ici sont ceux de l'application.
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const AUJOURDHUI = '2026-12-07';
const MARDI = '2026-12-08';
const ENTETE_UTILISATEUR = 'x-test-utilisateur';

interface Fixtures {
  admin: UtilisateurConnecte;
  gestionnaire: UtilisateurConnecte;
  kevin: { idTechnicien: number; compte: UtilisateurConnecte };
  mathieu: { idTechnicien: number; compte: UtilisateurConnecte };
  idTechnicienArchive: number;
  idAdresse: number;
  idType: number;
}

/** Instant à La Réunion le mardi 8 décembre 2026. */
function mardiA(heure: string): string {
  return `${MARDI}T${heure}:00+04:00`;
}

describe('planification des tournées (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: Fixtures;
  const journal = { enregistrer: vi.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Horloge)
      .useValue({ maintenant: () => MAINTENANT })
      .overrideProvider(JournalDesActions)
      .useValue(journal)
      .compile();
    app = module.createNestApplication();
    app.use(authentificationDeTest);
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    await viderLaBase(prisma);
    fixtures = await creerFixtures(prisma);
  });

  beforeEach(async () => {
    journal.enregistrer.mockClear();
    await prisma.$executeRaw`TRUNCATE TABLE intervention, tournee, indisponibilite RESTART IDENTITY`;
  });

  afterAll(async () => {
    await viderLaBase(prisma);
    await app.close();
  });

  function en(utilisateur: UtilisateurConnecte | undefined) {
    const agent = request(app.getHttpServer());
    const avecUtilisateur = <T extends request.Test>(requete: T): T =>
      utilisateur === undefined
        ? requete
        : requete.set(ENTETE_UTILISATEUR, `${utilisateur.role}:${utilisateur.id}`);
    return {
      get: (url: string) => avecUtilisateur(agent.get(`/api/v1${url}`)),
      post: (url: string) => avecUtilisateur(agent.post(`/api/v1${url}`)),
      put: (url: string) => avecUtilisateur(agent.put(`/api/v1${url}`)),
      delete: (url: string) => avecUtilisateur(agent.delete(`/api/v1${url}`)),
    };
  }

  async function creerTournee(idTechnicien: number, date = MARDI): Promise<number> {
    const tournee = await prisma.tournee.create({
      data: {
        idTechnicien,
        dateTournee: new Date(`${date}T00:00:00Z`),
        idCreateur: fixtures.gestionnaire.id,
      },
    });
    return tournee.id;
  }

  async function creerIntervention(
    donnees: {
      statut?: StatutIntervention;
      idTournee?: number;
      ordreTournee?: number;
      debutPrevu?: string;
      dureeEstimeeMin?: number;
    } = {},
  ): Promise<number> {
    const intervention = await prisma.intervention.create({
      data: {
        description: 'Fuite sous l’évier',
        urgence: Urgence.NORMALE,
        dureeEstimeeMin: donnees.dureeEstimeeMin ?? 60,
        statut: donnees.statut ?? StatutIntervention.A_PLANIFIER,
        idTournee: donnees.idTournee,
        ordreTournee: donnees.ordreTournee,
        debutPrevu: donnees.debutPrevu === undefined ? undefined : new Date(donnees.debutPrevu),
        idAdresse: fixtures.idAdresse,
        idTypeIntervention: fixtures.idType,
        idCreateur: fixtures.gestionnaire.id,
      },
    });
    return intervention.id;
  }

  async function rangsDeLaTournee(idTournee: number): Promise<number[]> {
    const interventions = await prisma.intervention.findMany({
      where: { idTournee },
      orderBy: { ordreTournee: 'asc' },
      select: { id: true },
    });
    return interventions.map(({ id }) => id);
  }

  describe('droits d’accès', () => {
    it('répond 401 sans utilisateur connecté', async () => {
      await en(undefined).get('/tours').expect(401);
    });

    it('répond 403 à un technicien qui veut créer une tournée', async () => {
      await en(fixtures.kevin.compte)
        .post('/tours')
        .send({ technicienId: fixtures.kevin.idTechnicien, dateTournee: MARDI })
        .expect(403);
    });

    it('répond 403 à un gestionnaire sur la route réservée aux techniciens', async () => {
      await en(fixtures.gestionnaire).get('/tours/me/today').expect(403);
    });
  });

  describe('POST /tours : créer une tournée (US20)', () => {
    it('crée la tournée et l’attribue au gestionnaire connecté', async () => {
      const reponse = await en(fixtures.gestionnaire)
        .post('/tours')
        .send({ technicienId: fixtures.kevin.idTechnicien, dateTournee: MARDI })
        .expect(201);

      expect(reponse.body).toEqual({
        id: expect.any(Number),
        dateTournee: MARDI,
        technicien: {
          id: fixtures.kevin.idTechnicien,
          nom: 'Hoarau',
          prenom: 'Kévin',
          telephone: '0692000001',
          couleurPlanning: '#0F766E',
        },
        interventions: [],
      });
      const enBase = await prisma.tournee.findUniqueOrThrow({ where: { id: reponse.body.id } });
      expect(enBase.idCreateur).toBe(fixtures.gestionnaire.id);
    });

    it('accepte une tournée pour aujourd’hui', async () => {
      await en(fixtures.admin)
        .post('/tours')
        .send({ technicienId: fixtures.kevin.idTechnicien, dateTournee: AUJOURDHUI })
        .expect(201);
    });

    it('TI13 : refuse en 409 une deuxième tournée le même jour pour le même technicien', async () => {
      await creerTournee(fixtures.kevin.idTechnicien);

      const reponse = await en(fixtures.gestionnaire)
        .post('/tours')
        .send({ technicienId: fixtures.kevin.idTechnicien, dateTournee: MARDI })
        .expect(409);

      expect(reponse.body.message).toBe(`Le technicien a déjà une tournée le ${MARDI}.`);
    });

    it('RG08 : deux créations simultanées donnent une tournée et un 409', async () => {
      const corps = { technicienId: fixtures.kevin.idTechnicien, dateTournee: MARDI };

      const statuts = await Promise.all([
        en(fixtures.gestionnaire).post('/tours').send(corps),
        en(fixtures.gestionnaire).post('/tours').send(corps),
      ]);

      expect(statuts.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(await prisma.tournee.count()).toBe(1);
    });

    it('TI12 : refuse en 400 une tournée à une date passée', async () => {
      await en(fixtures.gestionnaire)
        .post('/tours')
        .send({ technicienId: fixtures.kevin.idTechnicien, dateTournee: '2026-12-05' })
        .expect(400);
    });

    it('refuse en 400 un technicien archivé', async () => {
      await en(fixtures.gestionnaire)
        .post('/tours')
        .send({ technicienId: fixtures.idTechnicienArchive, dateTournee: MARDI })
        .expect(400);
    });

    it('refuse en 400 un champ inconnu, sans rien créer', async () => {
      const reponse = await en(fixtures.gestionnaire)
        .post('/tours')
        .send({ technicienId: fixtures.kevin.idTechnicien, dateTournee: MARDI, idCreateur: 1 })
        .expect(400);

      expect(reponse.body.message).toEqual(['Le champ idCreateur n’est pas autorisé']);
      expect(await prisma.tournee.count()).toBe(0);
    });
  });

  describe('POST /tours/:id/interventions : affecter une intervention (US21)', () => {
    it('planifie l’intervention sur le créneau et journalise le changement de statut', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      const idIntervention = await creerIntervention({ dureeEstimeeMin: 90 });

      const reponse = await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: idIntervention, debutPrevu: mardiA('08:00') })
        .expect(200);

      expect(reponse.body.interventions).toEqual([
        expect.objectContaining({
          id: idIntervention,
          statut: 'PLANIFIEE',
          ordreTournee: 1,
          debutPrevu: '2026-12-08T04:00:00.000Z',
          // Colonne générée par PostgreSQL : début + 90 minutes.
          finPrevue: '2026-12-08T05:30:00.000Z',
          enRetard: false,
          client: expect.objectContaining({ nomAffiche: 'Josiane Hoareau' }),
          tournee: expect.objectContaining({ id: idTournee, dateTournee: MARDI }),
        }),
      ]);
      expect(journal.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STATUT_MODIFIE',
          interventionId: idIntervention,
          ancienStatut: 'A_PLANIFIER',
          nouveauStatut: 'PLANIFIEE',
          auteurId: fixtures.gestionnaire.id,
        }),
      );
    });

    it('TI04 : refuse en 409 un créneau déjà occupé, sans rien modifier', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      const idOccupante = await creerIntervention({
        statut: StatutIntervention.PLANIFIEE,
        idTournee,
        ordreTournee: 1,
        debutPrevu: mardiA('09:00'),
      });
      const idNouvelle = await creerIntervention();

      const reponse = await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: idNouvelle, debutPrevu: mardiA('09:30') })
        .expect(409);

      expect(reponse.body.message).toBe(
        `Le technicien a déjà l’intervention n° ${idOccupante} sur ce créneau (09:00–10:00).`,
      );
      const nouvelle = await prisma.intervention.findUniqueOrThrow({ where: { id: idNouvelle } });
      expect(nouvelle).toMatchObject({ statut: 'A_PLANIFIER', idTournee: null, debutPrevu: null });
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });

    it('accepte un créneau qui commence à la fin du précédent', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      await creerIntervention({
        statut: StatutIntervention.PLANIFIEE,
        idTournee,
        ordreTournee: 1,
        debutPrevu: mardiA('09:00'),
      });
      const idNouvelle = await creerIntervention();

      await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: idNouvelle, debutPrevu: mardiA('10:00') })
        .expect(200);
    });

    it('TI05 : refuse en 409 un créneau pendant une indisponibilité', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      await prisma.indisponibilite.create({
        data: {
          idTechnicien: fixtures.kevin.idTechnicien,
          debut: new Date(mardiA('13:00')),
          fin: new Date(mardiA('19:00')),
          motif: 'Rendez-vous médical',
        },
      });
      const idIntervention = await creerIntervention();

      const reponse = await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: idIntervention, debutPrevu: mardiA('12:30') })
        .expect(409);

      expect(reponse.body.message).toContain('Rendez-vous médical');
    });

    it('RG11 : refuse en 400 un créneau qui finit après 19 h à La Réunion', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      const idIntervention = await creerIntervention();

      await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: idIntervention, debutPrevu: mardiA('18:30') })
        .expect(400);
    });

    it('refuse en 400 une intervention déjà planifiée', async () => {
      const idAutreTournee = await creerTournee(fixtures.mathieu.idTechnicien);
      const idPlanifiee = await creerIntervention({
        statut: StatutIntervention.PLANIFIEE,
        idTournee: idAutreTournee,
        ordreTournee: 1,
        debutPrevu: mardiA('08:00'),
      });
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);

      await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: idPlanifiee, debutPrevu: mardiA('14:00') })
        .expect(400);
    });

    it('insère au rang demandé et décale les suivantes', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      const premiere = await creerIntervention({
        statut: StatutIntervention.PLANIFIEE,
        idTournee,
        ordreTournee: 1,
        debutPrevu: mardiA('10:00'),
      });
      const urgence = await creerIntervention();

      await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: urgence, debutPrevu: mardiA('08:00'), ordreTournee: 1 })
        .expect(200);

      expect(await rangsDeLaTournee(idTournee)).toEqual([urgence, premiere]);
    });

    it('RG09 : deux affectations simultanées sur le même créneau donnent un 200 et un 409', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      const [premiere, seconde] = [await creerIntervention(), await creerIntervention()];

      const reponses = await Promise.all(
        [premiere, seconde].map((interventionId) =>
          en(fixtures.gestionnaire)
            .post(`/tours/${idTournee}/interventions`)
            .send({ interventionId, debutPrevu: mardiA('09:00') }),
        ),
      );

      expect(reponses.map(({ status }) => status).sort()).toEqual([200, 409]);
      expect(await prisma.intervention.count({ where: { idTournee } })).toBe(1);
    });

    it('répond 404 pour une tournée inexistante', async () => {
      const idIntervention = await creerIntervention();

      await en(fixtures.gestionnaire)
        .post('/tours/999/interventions')
        .send({ interventionId: idIntervention, debutPrevu: mardiA('09:00') })
        .expect(404);
    });
  });

  describe('DELETE /tours/:id/interventions/:interventionId : retirer (RG04)', () => {
    it('remet l’intervention à planifier et recalcule l’ordre des suivantes', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      const ids = [
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 1,
          debutPrevu: mardiA('08:00'),
        }),
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 2,
          debutPrevu: mardiA('10:00'),
        }),
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 3,
          debutPrevu: mardiA('14:00'),
        }),
      ];

      const reponse = await en(fixtures.gestionnaire)
        .delete(`/tours/${idTournee}/interventions/${ids[1]}`)
        .expect(200);

      expect(
        reponse.body.interventions.map(
          ({ id, ordreTournee }: { id: number; ordreTournee: number }) => [id, ordreTournee],
        ),
      ).toEqual([
        [ids[0], 1],
        [ids[2], 2],
      ]);
      const retiree = await prisma.intervention.findUniqueOrThrow({ where: { id: ids[1] } });
      expect(retiree).toMatchObject({
        statut: 'A_PLANIFIER',
        idTournee: null,
        ordreTournee: null,
        debutPrevu: null,
        finPrevue: null,
      });
    });

    it('refuse en 400 de retirer une intervention en cours (RG15)', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien, AUJOURDHUI);
      const idEnCours = await creerIntervention({
        statut: StatutIntervention.EN_COURS,
        idTournee,
        ordreTournee: 1,
        debutPrevu: `${AUJOURDHUI}T08:30:00+04:00`,
      });

      await en(fixtures.gestionnaire)
        .delete(`/tours/${idTournee}/interventions/${idEnCours}`)
        .expect(400);
    });
  });

  describe('PUT /tours/:id/order : réordonner (US22)', () => {
    it('enregistre le nouvel ordre en une transaction', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      const [a, b, c] = [
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 1,
          debutPrevu: mardiA('08:00'),
        }),
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 2,
          debutPrevu: mardiA('10:00'),
        }),
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 3,
          debutPrevu: mardiA('14:00'),
        }),
      ];

      await en(fixtures.gestionnaire)
        .put(`/tours/${idTournee}/order`)
        .send({ interventionIds: [c, a, b] })
        .expect(200);

      expect(await rangsDeLaTournee(idTournee)).toEqual([c, a, b]);
    });

    it('TI14 : refuse en 400 deux fois la même intervention, sans rien modifier', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      const [a, b] = [
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 1,
          debutPrevu: mardiA('08:00'),
        }),
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 2,
          debutPrevu: mardiA('10:00'),
        }),
      ];

      await en(fixtures.gestionnaire)
        .put(`/tours/${idTournee}/order`)
        .send({ interventionIds: [b, b] })
        .expect(400);

      expect(await rangsDeLaTournee(idTournee)).toEqual([a, b]);
    });

    it('RG16 : refuse en 400 de déplacer une intervention terminée', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien, AUJOURDHUI);
      const terminee = await prisma.intervention.create({
        data: {
          description: 'Joint remplacé',
          urgence: Urgence.NORMALE,
          dureeEstimeeMin: 30,
          statut: StatutIntervention.TERMINEE,
          idTournee,
          ordreTournee: 1,
          debutPrevu: new Date(`${AUJOURDHUI}T07:00:00+04:00`),
          idAdresse: fixtures.idAdresse,
          idTypeIntervention: fixtures.idType,
          idCreateur: fixtures.gestionnaire.id,
        },
      });
      const planifiee = await creerIntervention({
        statut: 'PLANIFIEE',
        idTournee,
        ordreTournee: 2,
        debutPrevu: `${AUJOURDHUI}T14:00:00+04:00`,
      });

      const reponse = await en(fixtures.gestionnaire)
        .put(`/tours/${idTournee}/order`)
        .send({ interventionIds: [planifiee, terminee.id] })
        .expect(400);

      expect(reponse.body.message).toContain('ne peut plus changer de place');
      expect(await rangsDeLaTournee(idTournee)).toEqual([terminee.id, planifiee]);
    });
  });

  describe('GET /tours : planning (US23)', () => {
    it('renvoie par défaut la semaine en cours, avec les techniciens sans tournée', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien);
      await creerIntervention({
        statut: 'PLANIFIEE',
        idTournee,
        ordreTournee: 1,
        debutPrevu: mardiA('08:00'),
      });

      const reponse = await en(fixtures.gestionnaire).get('/tours').expect(200);

      expect(reponse.body.du).toBe('2026-12-07');
      expect(reponse.body.au).toBe('2026-12-12');
      // Triés par nom ; le technicien archivé n'apparaît pas.
      expect(reponse.body.techniciens.map(({ nom }: { nom: string }) => nom)).toEqual([
        'Grondin',
        'Hoarau',
      ]);
      const [mathieu, kevin] = reponse.body.techniciens;
      expect(mathieu.tournees).toEqual([]);
      expect(kevin.tournees).toEqual([
        expect.objectContaining({
          id: idTournee,
          dateTournee: MARDI,
          interventions: [expect.any(Object)],
        }),
      ]);
    });

    it('filtre sur un jour et un technicien, indisponibilités comprises', async () => {
      await creerTournee(fixtures.kevin.idTechnicien);
      await creerTournee(fixtures.kevin.idTechnicien, '2026-12-09');
      // Mercredi 1 h à La Réunion = mardi 21 h UTC : hors de la journée du mardi à La Réunion,
      // alors qu'un découpage des journées en UTC l'y ferait entrer.
      await prisma.indisponibilite.createMany({
        data: [
          {
            idTechnicien: fixtures.kevin.idTechnicien,
            debut: new Date('2026-12-09T01:00:00+04:00'),
            fin: new Date('2026-12-09T02:00:00+04:00'),
          },
          {
            idTechnicien: fixtures.kevin.idTechnicien,
            debut: new Date(mardiA('14:00')),
            fin: new Date(mardiA('16:00')),
            motif: 'Formation',
          },
        ],
      });

      const reponse = await en(fixtures.gestionnaire)
        .get('/tours')
        .query({ du: MARDI, au: MARDI, technicienId: fixtures.kevin.idTechnicien })
        .expect(200);

      expect(reponse.body.techniciens).toHaveLength(1);
      const [kevin] = reponse.body.techniciens;
      expect(kevin.tournees.map(({ dateTournee }: { dateTournee: string }) => dateTournee)).toEqual(
        [MARDI],
      );
      expect(kevin.indisponibilites).toEqual([
        expect.objectContaining({ motif: 'Formation', debut: '2026-12-08T10:00:00.000Z' }),
      ]);
    });

    it('TI10 : refuse en 400 un filtre contenant du SQL', async () => {
      await en(fixtures.gestionnaire).get('/tours').query({ technicienId: '1 OR 1=1' }).expect(400);
    });
  });

  describe('GET /tours/me/today : ma tournée du jour (US24)', () => {
    it('renvoie au technicien connecté sa tournée du jour, dans l’ordre', async () => {
      const idTournee = await creerTournee(fixtures.kevin.idTechnicien, AUJOURDHUI);
      await creerTournee(fixtures.mathieu.idTechnicien, AUJOURDHUI);
      const [seconde, premiere] = [
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 2,
          debutPrevu: `${AUJOURDHUI}T14:00:00+04:00`,
        }),
        await creerIntervention({
          statut: 'PLANIFIEE',
          idTournee,
          ordreTournee: 1,
          debutPrevu: `${AUJOURDHUI}T08:00:00+04:00`,
        }),
      ];

      const reponse = await en(fixtures.kevin.compte).get('/tours/me/today').expect(200);

      expect(reponse.body.id).toBe(idTournee);
      expect(reponse.body.interventions.map(({ id }: { id: number }) => id)).toEqual([
        premiere,
        seconde,
      ]);
      // RG20 : prévue à 8 h, non démarrée à 9 h.
      expect(reponse.body.interventions[0].enRetard).toBe(true);
    });

    it('répond 204 quand le technicien n’a pas de tournée aujourd’hui', async () => {
      await creerTournee(fixtures.mathieu.idTechnicien, AUJOURDHUI);

      await en(fixtures.kevin.compte).get('/tours/me/today').expect(204);
    });
  });

  describe('GET /tours/:id', () => {
    it('répond 404 pour une tournée inexistante et 400 pour un identifiant invalide', async () => {
      await en(fixtures.gestionnaire).get('/tours/999').expect(404);
      await en(fixtures.gestionnaire).get('/tours/abc').expect(400);
    });
  });
});

/** Place dans request.user l'utilisateur décrit par l'en-tête de test « ROLE:id ». */
function authentificationDeTest(
  requete: RequeteAuthentifiee,
  _reponse: Response,
  suivant: NextFunction,
): void {
  const valeur = requete.headers[ENTETE_UTILISATEUR];
  if (typeof valeur === 'string') {
    const [role, id] = valeur.split(':');
    requete.user = { role: role as UtilisateurConnecte['role'], id: Number(id) };
  }
  suivant();
}

async function viderLaBase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRaw`
    TRUNCATE TABLE
      intervention, tournee, indisponibilite, technicien, adresse, client,
      type_intervention, jeton_rafraichissement, jeton_reinitialisation, utilisateur
    RESTART IDENTITY`;
}

async function creerFixtures(prisma: PrismaService): Promise<Fixtures> {
  // Les mots de passe ne servent pas ici : l'authentification est simulée.
  const compte = { motDePasseHash: 'inutilise-dans-ce-test' };
  const admin = await prisma.utilisateur.create({
    data: { ...compte, email: 'admin@test.re', nom: 'Bidel', prenom: 'Arnaud', role: 'ADMIN' },
  });
  const gestionnaire = await prisma.utilisateur.create({
    data: {
      ...compte,
      email: 'gestion@test.re',
      nom: 'Payet',
      prenom: 'Céline',
      role: 'GESTIONNAIRE',
    },
  });

  async function creerTechnicien(
    email: string,
    nom: string,
    prenom: string,
    telephone: string,
    archive = false,
  ) {
    const technicien = await prisma.technicien.create({
      data: {
        telephone,
        couleurPlanning: '#0F766E',
        archive,
        utilisateur: {
          create: { ...compte, email, nom, prenom, role: 'TECHNICIEN', actif: !archive },
        },
      },
    });
    return {
      idTechnicien: technicien.id,
      compte: { id: technicien.idUtilisateur, role: 'TECHNICIEN' as const },
    };
  }

  const kevin = await creerTechnicien('kevin@test.re', 'Hoarau', 'Kévin', '0692000001');
  const mathieu = await creerTechnicien('mathieu@test.re', 'Grondin', 'Mathieu', '0692000002');
  const archive = await creerTechnicien('jean@test.re', 'Robert', 'Jean', '0692000004', true);
  const client = await prisma.client.create({
    data: {
      typeClient: 'PARTICULIER',
      nomClient: 'Hoareau',
      prenomClient: 'Josiane',
      telephone: '0262000101',
      adresses: { create: [{ rue: '12 rue de Paris', codePostal: '97400', ville: 'Saint-Denis' }] },
    },
    include: { adresses: true },
  });
  const type = await prisma.typeIntervention.create({
    data: { libelle: 'Recherche de fuite', dureeDefautMin: 60 },
  });
  return {
    admin: { id: admin.id, role: 'ADMIN' },
    gestionnaire: { id: gestionnaire.id, role: 'GESTIONNAIRE' },
    kevin,
    mathieu,
    idTechnicienArchive: archive.idTechnicien,
    idAdresse: client.adresses[0].id,
    idType: type.id,
  };
}
