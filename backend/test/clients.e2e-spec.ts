import type { UtilisateurConnecte } from '../src/commun/autorisation/utilisateur-connecte.js';
import { StatutIntervention, Urgence } from '../src/generated/prisma/client.ts';
import {
  type ApplicationDeTest,
  creerCompte,
  demarrerApplication,
  requetesEn,
  viderLaBase,
} from './support/application-de-test.js';

/*
 * Tests d'intégration des clients (issue #15) : routes HTTP, règles de gestion et requêtes SQL
 * écrites à la main ensemble, sur la base éphémère de Testcontainers.
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');

const ADRESSE = { rue: '12 rue des Lilas', codePostal: '97400', ville: 'Saint-Denis' };

interface Fixtures {
  gestionnaire: UtilisateurConnecte;
  admin: UtilisateurConnecte;
  technicien: UtilisateurConnecte;
  idTechnicien: number;
  idType: number;
}

describe('clients (e2e)', () => {
  let application: ApplicationDeTest;
  let fixtures: Fixtures;

  beforeAll(async () => {
    application = await demarrerApplication(MAINTENANT);
    const { prisma } = application;
    const gestionnaire = await creerCompte(prisma, {
      email: 'gestion@test.re',
      nom: 'Payet',
      prenom: 'Céline',
      role: 'GESTIONNAIRE',
    });
    const admin = await creerCompte(prisma, {
      email: 'admin@test.re',
      nom: 'Bidel',
      prenom: 'Arnaud',
      role: 'ADMIN',
    });
    const technicien = await creerCompte(prisma, {
      email: 'kevin@test.re',
      nom: 'Hoarau',
      prenom: 'Kévin',
      role: 'TECHNICIEN',
    });
    const fiche = await prisma.technicien.create({
      data: { telephone: '0692000001', couleurPlanning: '#0F766E', idUtilisateur: technicien.id },
    });
    const type = await prisma.typeIntervention.create({
      data: { libelle: 'Recherche de fuite', dureeDefautMin: 60 },
    });
    fixtures = { gestionnaire, admin, technicien, idTechnicien: fiche.id, idType: type.id };
  });

  beforeEach(async () => {
    await application.prisma.$executeRaw`
      TRUNCATE TABLE signature_intervention, intervention, tournee, adresse, client RESTART IDENTITY`;
  });

  afterAll(async () => {
    await viderLaBase(application.prisma);
    await application.app.close();
  });

  const gestionnaire = () => requetesEn(application.app, fixtures.gestionnaire);

  async function creerClient(corps: Record<string, unknown>): Promise<number> {
    const reponse = await gestionnaire()
      .post('/clients')
      .send({ typeClient: 'PARTICULIER', telephone: '0692123456', adresse: ADRESSE, ...corps })
      .expect(201);
    return reponse.body.id as number;
  }

  async function premiereAdresse(idClient: number): Promise<number> {
    const adresse = await application.prisma.adresse.findFirstOrThrow({ where: { idClient } });
    return adresse.id;
  }

  /** Intervention planifiée le mardi 8 décembre à 8 h dans une tournée du technicien. */
  async function planifierUneIntervention(idAdresse: number): Promise<number> {
    const { prisma } = application;
    const tournee = await prisma.tournee.create({
      data: {
        idTechnicien: fixtures.idTechnicien,
        dateTournee: new Date('2026-12-08T00:00:00Z'),
        idCreateur: fixtures.gestionnaire.id,
      },
    });
    const intervention = await prisma.intervention.create({
      data: {
        description: 'Fuite sous l’évier',
        urgence: Urgence.NORMALE,
        dureeEstimeeMin: 60,
        statut: StatutIntervention.PLANIFIEE,
        idTournee: tournee.id,
        ordreTournee: 1,
        debutPrevu: new Date('2026-12-08T08:00:00+04:00'),
        idAdresse,
        idTypeIntervention: fixtures.idType,
        idCreateur: fixtures.gestionnaire.id,
      },
    });
    return intervention.id;
  }

  describe('droits d’accès', () => {
    it('répond 401 sans utilisateur connecté', async () => {
      await requetesEn(application.app).get('/clients').expect(401);
    });

    it('répond 403 à un technicien (TI02)', async () => {
      await requetesEn(application.app, fixtures.technicien).get('/clients').expect(403);
      await requetesEn(application.app, fixtures.technicien).post('/clients').send({}).expect(403);
    });

    it('autorise un administrateur', async () => {
      await requetesEn(application.app, fixtures.admin).get('/clients').expect(200);
    });
  });

  describe('création (US06)', () => {
    it('crée le client et sa première adresse, téléphone normalisé', async () => {
      const reponse = await gestionnaire()
        .post('/clients')
        .send({
          typeClient: 'PARTICULIER',
          nomClient: 'Dupont',
          prenomClient: 'Jean',
          telephone: '06 92 12 34 56',
          emailClient: 'jean.dupont@exemple.re',
          adresse: { ...ADRESSE, complement: 'Bât. B', infosAcces: 'Code 4521' },
        })
        .expect(201);

      expect(reponse.body).toMatchObject({
        typeClient: 'PARTICULIER',
        nomAffiche: 'Jean Dupont',
        telephone: '0692123456',
        archive: false,
        archiveLe: null,
        adresses: [{ ...ADRESSE, complement: 'Bât. B', infosAcces: 'Code 4521', archive: false }],
      });
      expect(reponse.body.adresses[0]).not.toHaveProperty('idClient');
    });

    it('refuse un client sans adresse, et n’enregistre rien (RG21)', async () => {
      const reponse = await gestionnaire()
        .post('/clients')
        .send({ typeClient: 'PARTICULIER', nomClient: 'Dupont', telephone: '0692123456' })
        .expect(400);

      expect(reponse.body.message).toEqual(['adresse est obligatoire']);
      expect(await application.prisma.client.count()).toBe(0);
    });

    it('refuse un particulier sans nom', async () => {
      const reponse = await gestionnaire()
        .post('/clients')
        .send({ typeClient: 'PARTICULIER', telephone: '0692123456', adresse: ADRESSE })
        .expect(400);

      expect(reponse.body).toEqual({
        statusCode: 400,
        message: ['nomClient est obligatoire pour un particulier'],
        error: 'Bad Request',
      });
    });

    it('refuse un champ inconnu', async () => {
      await gestionnaire()
        .post('/clients')
        .send({
          typeClient: 'PARTICULIER',
          nomClient: 'Dupont',
          telephone: '0692123456',
          adresse: ADRESSE,
          archive: true,
        })
        .expect(400);
    });
  });

  describe('recherche et liste (US08)', () => {
    it('ne laisse pas une injection SQL modifier la requête (TI10)', async () => {
      await creerClient({ nomClient: 'Dupont' });
      await creerClient({ nomClient: 'Técher' });

      const reponse = await gestionnaire()
        .get('/clients')
        .query({ recherche: "' OR 1=1 --" })
        .expect(200);

      expect(reponse.body).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
      expect(await application.prisma.client.count()).toBe(2);
    });

    it('trouve « Hélène » en cherchant « helene », sans tenir compte des accents ni de la casse', async () => {
      await creerClient({ nomClient: 'Payet', prenomClient: 'Hélène' });
      await creerClient({ nomClient: 'Hoarau', prenomClient: 'Paul' });

      const reponse = await gestionnaire()
        .get('/clients')
        .query({ recherche: 'HELENE' })
        .expect(200);

      expect(reponse.body.data.map((client: { nomAffiche: string }) => client.nomAffiche)).toEqual([
        'Hélène Payet',
      ]);
    });

    it('cherche aussi dans la raison sociale, le téléphone saisi avec espaces et la ville', async () => {
      await creerClient({ typeClient: 'PROFESSIONNEL', raisonSociale: 'Boulangerie Grondin' });
      await creerClient({ nomClient: 'Lebon', telephone: '0262987654' });
      await creerClient({ nomClient: 'Fontaine', adresse: { ...ADRESSE, ville: 'Le Port' } });

      const noms = async (recherche: string) =>
        (await gestionnaire().get('/clients').query({ recherche }).expect(200)).body.data.map(
          (client: { nomAffiche: string }) => client.nomAffiche,
        );

      expect(await noms('grondin')).toEqual(['Boulangerie Grondin']);
      expect(await noms('0262 98')).toEqual(['Lebon']);
      expect(await noms('le port')).toEqual(['Fontaine']);
    });

    it('traite « % » comme un caractère et non comme un joker', async () => {
      await creerClient({ nomClient: 'Dupont' });

      const reponse = await gestionnaire().get('/clients').query({ recherche: '%%' }).expect(200);

      expect(reponse.body.meta.total).toBe(0);
    });

    it('refuse une recherche d’un caractère', async () => {
      await gestionnaire().get('/clients').query({ recherche: 'd' }).expect(400);
    });

    it('trie par nom affiché sur plusieurs pages, sans sauter ni répéter de client', async () => {
      // Créés dans un ordre différent de l'ordre alphabétique : l'ordre des identifiants ne
      // doit pas fuir dans la réponse.
      for (const [prenomClient, nomClient] of [
        ['Paul', 'Lebon'],
        ['Éric', 'Abadie'],
        ['agnès', 'Zitte'],
        ['Hélène', 'Payet'],
        ['Bruno', 'Grondin'],
      ]) {
        await creerClient({ prenomClient, nomClient });
      }
      await creerClient({ typeClient: 'PROFESSIONNEL', raisonSociale: 'Carrelage Dijoux' });

      async function parcourir(tri: string): Promise<string[]> {
        const noms: string[] = [];
        for (const page of [1, 2, 3]) {
          const reponse = await gestionnaire()
            .get('/clients')
            .query({ tri, page: String(page), limit: '2' })
            .expect(200);
          expect(reponse.body.meta).toEqual({ page, limit: 2, total: 6, totalPages: 3 });
          noms.push(
            ...reponse.body.data.map((client: { nomAffiche: string }) => client.nomAffiche),
          );
        }
        return noms;
      }

      const attendu = [
        'agnès Zitte',
        'Bruno Grondin',
        'Carrelage Dijoux',
        'Éric Abadie',
        'Hélène Payet',
        'Paul Lebon',
      ];
      expect(await parcourir('nomAffiche')).toEqual(attendu);
      expect(await parcourir('-nomAffiche')).toEqual([...attendu].reverse());
    });

    it('cache les clients archivés, sauf avec archives=true, et filtre par type', async () => {
      await creerClient({ nomClient: 'Actif' });
      const idArchive = await creerClient({ nomClient: 'Archivé' });
      await creerClient({ typeClient: 'PROFESSIONNEL', raisonSociale: 'SARL Pro' });
      await gestionnaire().post(`/clients/${idArchive}/archive`).expect(200);

      const total = async (query: Record<string, string>) =>
        (await gestionnaire().get('/clients').query(query).expect(200)).body.meta.total;

      expect(await total({})).toBe(2);
      expect(await total({ archives: 'true' })).toBe(3);
      expect(await total({ typeClient: 'PROFESSIONNEL' })).toBe(1);
    });
  });

  describe('consultation et modification (US06, US10)', () => {
    it('répond 404 pour un client inexistant', async () => {
      await gestionnaire().get('/clients/999').expect(404);
      await gestionnaire().patch('/clients/999').send({}).expect(404);
    });

    it('modifie le téléphone et efface le prénom avec null', async () => {
      const id = await creerClient({ nomClient: 'Dupont', prenomClient: 'Jean' });

      const reponse = await gestionnaire()
        .patch(`/clients/${id}`)
        .send({ telephone: '06.92.00.00.01', prenomClient: null })
        .expect(200);

      expect(reponse.body).toMatchObject({
        telephone: '0692000001',
        prenomClient: null,
        nomAffiche: 'Dupont',
      });
    });

    it('vérifie la raison sociale quand le client devient professionnel', async () => {
      const id = await creerClient({ nomClient: 'Dupont' });

      await gestionnaire()
        .patch(`/clients/${id}`)
        .send({ typeClient: 'PROFESSIONNEL' })
        .expect(400);
      const reponse = await gestionnaire()
        .patch(`/clients/${id}`)
        .send({ typeClient: 'PROFESSIONNEL', raisonSociale: 'Dupont SARL' })
        .expect(200);

      expect(reponse.body.nomAffiche).toBe('Dupont SARL');
    });
  });

  describe('archivage (US10, RG22)', () => {
    it('refuse 409 un client qui a une intervention planifiée', async () => {
      const id = await creerClient({ nomClient: 'Dupont' });
      await planifierUneIntervention(await premiereAdresse(id));

      const reponse = await gestionnaire().post(`/clients/${id}/archive`).expect(409);

      expect(reponse.body.message).toContain('planifiées ou en cours (1 actuellement)');
      const client = await application.prisma.client.findUniqueOrThrow({ where: { id } });
      expect(client.archive).toBe(false);
    });

    it('archive un client sans intervention active, puis refuse de le modifier ou de le réarchiver', async () => {
      const id = await creerClient({ nomClient: 'Dupont' });

      const reponse = await gestionnaire().post(`/clients/${id}/archive`).expect(200);

      expect(reponse.body).toMatchObject({ archive: true, archiveLe: MAINTENANT.toISOString() });
      await gestionnaire().post(`/clients/${id}/archive`).expect(400);
      await gestionnaire().patch(`/clients/${id}`).send({ nomClient: 'Durand' }).expect(400);
      await gestionnaire().get(`/clients/${id}`).expect(200);
    });
  });

  describe('adresses (US07)', () => {
    const NOUVELLE = {
      rue: '3 chemin Bois de Nèfles',
      codePostal: '97490',
      ville: 'Sainte-Clotilde',
    };

    it('ajoute une adresse, la corrige, puis archive l’ancienne', async () => {
      const idClient = await creerClient({ nomClient: 'Dupont' });
      const idAncienne = await premiereAdresse(idClient);

      const ajout = await gestionnaire()
        .post(`/clients/${idClient}/addresses`)
        .send(NOUVELLE)
        .expect(201);
      expect(ajout.body).toMatchObject({ ...NOUVELLE, complement: null, archive: false });
      const correction = await gestionnaire()
        .patch(`/clients/${idClient}/addresses/${ajout.body.id}`)
        .send({ infosAcces: 'Portail vert' })
        .expect(200);
      expect(correction.body).toMatchObject({ rue: NOUVELLE.rue, infosAcces: 'Portail vert' });
      const archivage = await gestionnaire()
        .post(`/clients/${idClient}/addresses/${idAncienne}/archive`)
        .expect(200);

      expect(archivage.body).toMatchObject({ id: idAncienne, archive: true });
      const client = await gestionnaire().get(`/clients/${idClient}`).expect(200);
      expect(client.body.adresses).toHaveLength(2);
      const liste = await gestionnaire().get('/clients').expect(200);
      expect(liste.body.data[0].adresses.map((adresse: { id: number }) => adresse.id)).toEqual([
        ajout.body.id,
      ]);
    });

    it('refuse d’archiver la dernière adresse du client (RG21)', async () => {
      const idClient = await creerClient({ nomClient: 'Dupont' });

      const reponse = await gestionnaire()
        .post(`/clients/${idClient}/addresses/${await premiereAdresse(idClient)}/archive`)
        .expect(400);

      expect(reponse.body.message).toContain('dernière adresse du client');
    });

    it('répond 404 pour l’adresse d’un autre client, sans la toucher', async () => {
      const idDupont = await creerClient({ nomClient: 'Dupont' });
      const idTecher = await creerClient({ nomClient: 'Técher' });
      const adresseDeTecher = await premiereAdresse(idTecher);
      await gestionnaire().post(`/clients/${idDupont}/addresses`).send(NOUVELLE).expect(201);

      await gestionnaire()
        .patch(`/clients/${idDupont}/addresses/${adresseDeTecher}`)
        .send({ ville: 'Le Port' })
        .expect(404);
      await gestionnaire()
        .post(`/clients/${idDupont}/addresses/${adresseDeTecher}/archive`)
        .expect(404);

      const adresse = await application.prisma.adresse.findUniqueOrThrow({
        where: { id: adresseDeTecher },
      });
      expect(adresse).toMatchObject({ ville: 'Saint-Denis', archive: false });
    });

    it('refuse 409 l’archivage d’une adresse qui a une intervention planifiée', async () => {
      const idClient = await creerClient({ nomClient: 'Dupont' });
      const idAdresse = await premiereAdresse(idClient);
      await gestionnaire().post(`/clients/${idClient}/addresses`).send(NOUVELLE).expect(201);
      await planifierUneIntervention(idAdresse);

      await gestionnaire().post(`/clients/${idClient}/addresses/${idAdresse}/archive`).expect(409);
    });

    it('refuse d’ajouter une adresse à un client archivé, et une adresse invalide', async () => {
      const idClient = await creerClient({ nomClient: 'Dupont' });

      const invalide = await gestionnaire()
        .post(`/clients/${idClient}/addresses`)
        .send({ ...NOUVELLE, codePostal: '974' })
        .expect(400);
      expect(invalide.body.message).toEqual(['codePostal doit contenir 5 chiffres']);
      await gestionnaire().post(`/clients/${idClient}/archive`).expect(200);
      await gestionnaire().post(`/clients/${idClient}/addresses`).send(NOUVELLE).expect(400);
      await gestionnaire().post('/clients/999/addresses').send(NOUVELLE).expect(404);
    });
  });

  describe('historique (US09)', () => {
    it('renvoie les interventions du client au format du contrat, filtrables par statut', async () => {
      const id = await creerClient({ nomClient: 'Dupont', prenomClient: 'Jean' });
      const idIntervention = await planifierUneIntervention(await premiereAdresse(id));

      const reponse = await gestionnaire().get(`/clients/${id}/interventions`).expect(200);

      expect(reponse.body.meta.total).toBe(1);
      expect(reponse.body.data[0]).toMatchObject({
        id: idIntervention,
        statut: 'PLANIFIEE',
        client: { id, nomAffiche: 'Jean Dupont' },
        tournee: { dateTournee: '2026-12-08', technicien: { nom: 'Hoarau', prenom: 'Kévin' } },
      });
      const terminees = await gestionnaire()
        .get(`/clients/${id}/interventions`)
        .query({ statut: 'TERMINEE,ANNULEE' })
        .expect(200);
      expect(terminees.body.data).toEqual([]);
    });

    it('répond 404 pour un client inexistant', async () => {
      await gestionnaire().get('/clients/999/interventions').expect(404);
    });
  });
});
