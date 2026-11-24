import type { UtilisateurConnecte } from '../src/commun/autorisation/utilisateur-connecte.js';
import {
  type ApplicationDeTest,
  creerCompte,
  demarrerApplication,
  requetesEn,
  viderLaBase,
} from './support/application-de-test.js';

/*
 * Tests d'intégration des types d'intervention (contrat d'API, 6.4) : routes HTTP, droits et
 * contrainte d'unicité du libellé, sur la base éphémère de Testcontainers.
 */

const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');

describe('types d’intervention (e2e)', () => {
  let application: ApplicationDeTest;
  let admin: UtilisateurConnecte;
  let gestionnaire: UtilisateurConnecte;
  let technicien: UtilisateurConnecte;

  beforeAll(async () => {
    application = await demarrerApplication(MAINTENANT);
    const { prisma } = application;
    admin = await creerCompte(prisma, {
      email: 'admin@test.re',
      nom: 'Bidel',
      prenom: 'Arnaud',
      role: 'ADMIN',
    });
    gestionnaire = await creerCompte(prisma, {
      email: 'gestion@test.re',
      nom: 'Payet',
      prenom: 'Céline',
      role: 'GESTIONNAIRE',
    });
    technicien = await creerCompte(prisma, {
      email: 'kevin@test.re',
      nom: 'Hoarau',
      prenom: 'Kévin',
      role: 'TECHNICIEN',
    });
  });

  beforeEach(async () => {
    await application.prisma.$executeRaw`
      TRUNCATE TABLE intervention, adresse, client, type_intervention RESTART IDENTITY`;
  });

  afterAll(async () => {
    await viderLaBase(application.prisma);
    await application.app.close();
  });

  const en = (utilisateur?: UtilisateurConnecte) => requetesEn(application.app, utilisateur);

  describe('GET /intervention-types', () => {
    it('liste les types triés par libellé, pour tous les rôles connectés', async () => {
      await application.prisma.typeIntervention.createMany({
        data: [
          { libelle: 'Fuite', dureeDefautMin: 60 },
          { libelle: 'Débouchage', dureeDefautMin: 45 },
        ],
      });

      for (const utilisateur of [admin, gestionnaire, technicien]) {
        const reponse = await en(utilisateur).get('/intervention-types').expect(200);

        expect(reponse.body).toEqual([
          { id: 2, libelle: 'Débouchage', dureeDefautMin: 45 },
          { id: 1, libelle: 'Fuite', dureeDefautMin: 60 },
        ]);
      }
    });

    it('répond 401 sans utilisateur', async () => {
      await en().get('/intervention-types').expect(401);
    });
  });

  describe('POST /intervention-types', () => {
    it('crée un type (201)', async () => {
      const reponse = await en(admin)
        .post('/intervention-types')
        .send({ libelle: 'Chauffe-eau', dureeDefautMin: 120 })
        .expect(201);

      expect(reponse.body).toEqual({ id: 1, libelle: 'Chauffe-eau', dureeDefautMin: 120 });
    });

    it('répond 409 sur un libellé déjà utilisé, sans créer de doublon', async () => {
      await en(admin).post('/intervention-types').send({ libelle: 'Fuite', dureeDefautMin: 60 });

      const reponse = await en(admin)
        .post('/intervention-types')
        .send({ libelle: 'Fuite', dureeDefautMin: 30 })
        .expect(409);

      expect(reponse.body.message).toBe('Le type d’intervention « Fuite » existe déjà.');
      expect(await application.prisma.typeIntervention.count()).toBe(1);
    });

    it('deux créations simultanées du même libellé donnent un 201 et un 409', async () => {
      const reponses = await Promise.all(
        [30, 60].map((dureeDefautMin) =>
          en(admin).post('/intervention-types').send({ libelle: 'Fuite', dureeDefautMin }),
        ),
      );

      expect(reponses.map(({ status }) => status).sort()).toEqual([201, 409]);
    });

    it.each([
      ['durée trop courte', { libelle: 'Fuite', dureeDefautMin: 14 }],
      ['durée trop longue', { libelle: 'Fuite', dureeDefautMin: 721 }],
      ['libellé vide', { libelle: ' ', dureeDefautMin: 60 }],
      ['champ inconnu', { libelle: 'Fuite', dureeDefautMin: 60, actif: true }],
    ])('répond 400 : %s', async (_cas, corps) => {
      await en(admin).post('/intervention-types').send(corps).expect(400);
    });

    it.each([
      ['un gestionnaire', () => gestionnaire],
      ['un technicien', () => technicien],
    ])('répond 403 à %s', async (_cas, utilisateur) => {
      await en(utilisateur())
        .post('/intervention-types')
        .send({ libelle: 'Fuite', dureeDefautMin: 60 })
        .expect(403);
    });
  });

  describe('PATCH /intervention-types/:id', () => {
    it('modifie la durée par défaut sans toucher aux interventions déjà créées', async () => {
      const { prisma } = application;
      const type = await prisma.typeIntervention.create({
        data: { libelle: 'Fuite', dureeDefautMin: 60 },
      });
      const client = await prisma.client.create({
        data: {
          typeClient: 'PARTICULIER',
          nomClient: 'Grondin',
          telephone: '0262000000',
          adresses: {
            create: [{ rue: '1 rue de Paris', codePostal: '97400', ville: 'Saint-Denis' }],
          },
        },
        include: { adresses: true },
      });
      const intervention = await prisma.intervention.create({
        data: {
          description: 'Fuite',
          urgence: 'NORMALE',
          dureeEstimeeMin: 60,
          idAdresse: client.adresses[0].id,
          idTypeIntervention: type.id,
          idCreateur: gestionnaire.id,
        },
      });

      const reponse = await en(admin)
        .patch(`/intervention-types/${type.id}`)
        .send({ dureeDefautMin: 90 })
        .expect(200);

      expect(reponse.body).toEqual({ id: type.id, libelle: 'Fuite', dureeDefautMin: 90 });
      const inchangee = await prisma.intervention.findUniqueOrThrow({
        where: { id: intervention.id },
      });
      expect(inchangee.dureeEstimeeMin).toBe(60);
    });

    it('répond 409 si le nouveau libellé est celui d’un autre type', async () => {
      await application.prisma.typeIntervention.createMany({
        data: [
          { libelle: 'Fuite', dureeDefautMin: 60 },
          { libelle: 'Débouchage', dureeDefautMin: 45 },
        ],
      });

      await en(admin).patch('/intervention-types/2').send({ libelle: 'Fuite' }).expect(409);
    });

    it('répond 404 pour un type inexistant et 403 à un gestionnaire', async () => {
      await en(admin).patch('/intervention-types/99').send({ dureeDefautMin: 90 }).expect(404);
      await en(gestionnaire)
        .patch('/intervention-types/99')
        .send({ dureeDefautMin: 90 })
        .expect(403);
    });
  });
});
