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
 * Tests d'intégration des techniciens et de leurs indisponibilités (issue #15), sur la base
 * éphémère de Testcontainers.
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const HIER = '2026-12-05';
const DEMAIN = '2026-12-08';

interface Fixtures {
  gestionnaire: UtilisateurConnecte;
  kevin: UtilisateurConnecte;
  mathieu: UtilisateurConnecte;
  inactif: UtilisateurConnecte;
  idAdresse: number;
  idType: number;
}

describe('techniciens (e2e)', () => {
  let application: ApplicationDeTest;
  let fixtures: Fixtures;

  beforeAll(async () => {
    application = await demarrerApplication(MAINTENANT);
    const { prisma } = application;
    const technicien = (email: string, nom: string, prenom: string, actif = true) =>
      creerCompte(prisma, { email, nom, prenom, role: 'TECHNICIEN' }, actif);
    const client = await prisma.client.create({
      data: {
        typeClient: 'PARTICULIER',
        nomClient: 'Dupont',
        telephone: '0692123456',
        adresses: {
          create: [{ rue: '1 rue de Paris', codePostal: '97400', ville: 'Saint-Denis' }],
        },
      },
      include: { adresses: true },
    });
    const type = await prisma.typeIntervention.create({
      data: { libelle: 'Recherche de fuite', dureeDefautMin: 60 },
    });
    fixtures = {
      gestionnaire: await creerCompte(prisma, {
        email: 'gestion@test.re',
        nom: 'Payet',
        prenom: 'Céline',
        role: 'GESTIONNAIRE',
      }),
      kevin: await technicien('kevin@test.re', 'Hoarau', 'Kévin'),
      mathieu: await technicien('mathieu@test.re', 'Técher', 'Mathieu'),
      inactif: await technicien('parti@test.re', 'Grondin', 'Paul', false),
      idAdresse: client.adresses[0].id,
      idType: type.id,
    };
  });

  beforeEach(async () => {
    await application.prisma.$executeRaw`
      TRUNCATE TABLE signature_intervention, intervention, tournee, indisponibilite, technicien RESTART IDENTITY`;
  });

  afterAll(async () => {
    await viderLaBase(application.prisma);
    await application.app.close();
  });

  const gestionnaire = () => requetesEn(application.app, fixtures.gestionnaire);

  async function creerFiche(
    compte: UtilisateurConnecte,
    couleurPlanning?: string,
  ): Promise<number> {
    const reponse = await gestionnaire()
      .post('/technicians')
      .send({ utilisateurId: compte.id, telephone: '0692000001', couleurPlanning })
      .expect(201);
    return reponse.body.id as number;
  }

  /** Intervention du technicien dans sa tournée du jour donné, à 8 h. */
  async function interventionDuTechnicien(
    idTechnicien: number,
    jour: string,
    statut: StatutIntervention,
  ): Promise<number> {
    const { prisma } = application;
    const tournee = await prisma.tournee.create({
      data: {
        idTechnicien,
        dateTournee: new Date(`${jour}T00:00:00Z`),
        idCreateur: fixtures.gestionnaire.id,
      },
    });
    const intervention = await prisma.intervention.create({
      data: {
        description: 'Fuite sous l’évier',
        urgence: Urgence.NORMALE,
        dureeEstimeeMin: 60,
        statut,
        idTournee: tournee.id,
        ordreTournee: 1,
        debutPrevu: new Date(`${jour}T08:00:00+04:00`),
        idAdresse: fixtures.idAdresse,
        idTypeIntervention: fixtures.idType,
        idCreateur: fixtures.gestionnaire.id,
      },
    });
    return intervention.id;
  }

  describe('droits d’accès', () => {
    it('répond 401 sans utilisateur et 403 à un technicien', async () => {
      await requetesEn(application.app).get('/technicians').expect(401);
      await requetesEn(application.app, fixtures.kevin).get('/technicians').expect(403);
    });
  });

  describe('création (US11)', () => {
    it('crée la fiche d’un compte technicien avec la première couleur libre', async () => {
      await creerFiche(fixtures.mathieu, '#0F766E');

      const reponse = await gestionnaire()
        .post('/technicians')
        .send({ utilisateurId: fixtures.kevin.id, telephone: '06 92 12 34 56' })
        .expect(201);

      expect(reponse.body).toEqual({
        id: expect.any(Number),
        utilisateurId: fixtures.kevin.id,
        nom: 'Hoarau',
        prenom: 'Kévin',
        email: 'kevin@test.re',
        compteActif: true,
        telephone: '0692123456',
        couleurPlanning: '#1E88E5',
        archive: false,
        archiveLe: null,
      });
    });

    it('refuse 409 une deuxième fiche pour le même compte (D02)', async () => {
      await creerFiche(fixtures.kevin);

      const reponse = await gestionnaire()
        .post('/technicians')
        .send({ utilisateurId: fixtures.kevin.id, telephone: '0692000002' })
        .expect(409);

      expect(reponse.body.message).toBe('Ce compte a déjà une fiche technicien.');
    });

    it('refuse 400 un compte de rôle GESTIONNAIRE, un compte désactivé ou inexistant', async () => {
      const creer = (utilisateurId: number) =>
        gestionnaire().post('/technicians').send({ utilisateurId, telephone: '0692000001' });

      const roleGestionnaire = await creer(fixtures.gestionnaire.id).expect(400);
      expect(roleGestionnaire.body.message).toContain('rôle GESTIONNAIRE');
      await creer(fixtures.inactif.id).expect(400);
      await creer(999).expect(400);
      expect(await application.prisma.technicien.count()).toBe(0);
    });
  });

  describe('liste, consultation et modification (US11)', () => {
    it('trie par nom, cherche sans accents et cache les archivés', async () => {
      await creerFiche(fixtures.mathieu);
      const idKevin = await creerFiche(fixtures.kevin);

      const noms = async (query: Record<string, string>) =>
        (await gestionnaire().get('/technicians').query(query).expect(200)).body.data.map(
          (technicien: { nom: string }) => technicien.nom,
        );

      expect(await noms({})).toEqual(['Hoarau', 'Técher']);
      expect(await noms({ tri: '-nom' })).toEqual(['Técher', 'Hoarau']);
      expect(await noms({ recherche: 'kevin' })).toEqual(['Hoarau']);
      expect(await noms({ recherche: 'techer' })).toEqual(['Técher']);
      await gestionnaire().post(`/technicians/${idKevin}/archive`).expect(200);
      expect(await noms({})).toEqual(['Técher']);
      expect(await noms({ archives: 'true' })).toEqual(['Hoarau', 'Técher']);
    });

    it('modifie le téléphone et la couleur, mais pas le nom du compte', async () => {
      const id = await creerFiche(fixtures.kevin);

      const reponse = await gestionnaire()
        .patch(`/technicians/${id}`)
        .send({ telephone: '06.92.99.99.99', couleurPlanning: '#c62828' })
        .expect(200);
      expect(reponse.body).toMatchObject({ telephone: '0692999999', couleurPlanning: '#C62828' });

      const refus = await gestionnaire()
        .patch(`/technicians/${id}`)
        .send({ nom: 'Autre' })
        .expect(400);
      expect(refus.body.message).toEqual([
        'nom vient du compte utilisateur : il se modifie par PATCH /users/:id',
      ]);
    });

    it('répond 404 pour un technicien inexistant', async () => {
      await gestionnaire().get('/technicians/999').expect(404);
      await gestionnaire().post('/technicians/999/archive').expect(404);
    });
  });

  describe('archivage (US11, RG22)', () => {
    it('refuse 409 un technicien qui a une intervention planifiée demain', async () => {
      const id = await creerFiche(fixtures.kevin);
      await interventionDuTechnicien(id, DEMAIN, StatutIntervention.PLANIFIEE);

      await gestionnaire().post(`/technicians/${id}/archive`).expect(409);
    });

    it('refuse 409 une intervention restée « en cours » depuis un jour passé', async () => {
      const id = await creerFiche(fixtures.kevin);
      await interventionDuTechnicien(id, HIER, StatutIntervention.EN_COURS);

      await gestionnaire().post(`/technicians/${id}/archive`).expect(409);
    });

    it('archive malgré une intervention planifiée un jour passé, sans désactiver le compte', async () => {
      const id = await creerFiche(fixtures.kevin);
      await interventionDuTechnicien(id, HIER, StatutIntervention.PLANIFIEE);

      const reponse = await gestionnaire().post(`/technicians/${id}/archive`).expect(200);

      expect(reponse.body).toMatchObject({
        archive: true,
        archiveLe: MAINTENANT.toISOString(),
        compteActif: true,
      });
      await gestionnaire().post(`/technicians/${id}/archive`).expect(400);
      await gestionnaire()
        .patch(`/technicians/${id}`)
        .send({ telephone: '0692000009' })
        .expect(400);
    });
  });

  describe('indisponibilités (US12, RG10)', () => {
    const url = (idTechnicien: number) => `/technicians/${idTechnicien}/unavailabilities`;
    const periode = (debut: string, fin: string, motif?: string) => ({
      debut: `${debut}+04:00`,
      fin: `${fin}+04:00`,
      motif,
    });

    it('refuse 409 une période qui recouvre une intervention planifiée, en la citant', async () => {
      const id = await creerFiche(fixtures.kevin);
      const idIntervention = await interventionDuTechnicien(
        id,
        DEMAIN,
        StatutIntervention.PLANIFIEE,
      );

      const reponse = await gestionnaire()
        .post(url(id))
        .send(periode(`${DEMAIN}T07:00:00`, `${DEMAIN}T12:00:00`, 'Rendez-vous médical'))
        .expect(409);

      expect(reponse.body.message).toContain(`n° ${idIntervention} le 08/12/2026 de 08:00 à 09:00`);
      expect(await application.prisma.indisponibilite.count()).toBe(0);
    });

    it('accepte une période qui touche l’intervention sans la recouvrir', async () => {
      const id = await creerFiche(fixtures.kevin);
      await interventionDuTechnicien(id, DEMAIN, StatutIntervention.PLANIFIEE);

      await gestionnaire()
        .post(url(id))
        .send(periode(`${DEMAIN}T09:00:00`, `${DEMAIN}T19:00:00`))
        .expect(201);
    });

    it('refuse 400 une fin antérieure au début', async () => {
      const id = await creerFiche(fixtures.kevin);

      const reponse = await gestionnaire()
        .post(url(id))
        .send(periode(`${DEMAIN}T12:00:00`, `${DEMAIN}T08:00:00`))
        .expect(400);

      expect(reponse.body.message).toEqual(['fin doit être postérieure à debut']);
    });

    it('refuse 409 deux indisponibilités qui se recouvrent', async () => {
      const id = await creerFiche(fixtures.kevin);
      await gestionnaire()
        .post(url(id))
        .send(periode('2026-12-10T07:00:00', '2026-12-11T19:00:00', 'Congés'))
        .expect(201);

      const reponse = await gestionnaire()
        .post(url(id))
        .send(periode('2026-12-11T08:00:00', '2026-12-11T10:00:00'))
        .expect(409);

      expect(reponse.body.message).toContain('du 10/12/2026 07:00 au 11/12/2026 19:00');
    });

    it('liste les indisponibilités à venir par défaut, ou celles d’une période', async () => {
      const id = await creerFiche(fixtures.kevin);
      const { prisma } = application;
      for (const [debut, fin, motif] of [
        ['2026-12-01T07:00:00+04:00', '2026-12-01T19:00:00+04:00', 'Passée'],
        ['2026-12-07T07:00:00+04:00', '2026-12-07T12:00:00+04:00', 'En cours'],
        ['2026-12-20T07:00:00+04:00', '2026-12-21T19:00:00+04:00', 'À venir'],
      ]) {
        await prisma.indisponibilite.create({
          data: { idTechnicien: id, debut: new Date(debut), fin: new Date(fin), motif },
        });
      }
      const motifs = async (query: Record<string, string>) =>
        (await gestionnaire().get(url(id)).query(query).expect(200)).body.map(
          (indisponibilite: { motif: string }) => indisponibilite.motif,
        );

      expect(await motifs({})).toEqual(['En cours', 'À venir']);
      expect(await motifs({ du: '2026-12-01', au: '2026-12-01' })).toEqual(['Passée']);
      expect(await motifs({ au: '2026-12-07' })).toEqual(['Passée', 'En cours']);
      await gestionnaire().get(url(id)).query({ du: '2026-13-01' }).expect(400);
      await gestionnaire().get(url(999)).expect(404);
    });

    it('supprime une indisponibilité à venir (204), refuse une terminée (400)', async () => {
      const id = await creerFiche(fixtures.kevin);
      const { prisma } = application;
      const terminee = await prisma.indisponibilite.create({
        data: {
          idTechnicien: id,
          debut: new Date('2026-12-01T07:00:00+04:00'),
          fin: new Date('2026-12-01T19:00:00+04:00'),
        },
      });
      const creee = await gestionnaire()
        .post(url(id))
        .send(periode('2026-12-20T07:00:00', '2026-12-20T19:00:00'))
        .expect(201);

      await gestionnaire()
        .delete(`${url(id)}/${creee.body.id}`)
        .expect(204);
      await gestionnaire()
        .delete(`${url(id)}/${terminee.id}`)
        .expect(400);
      expect(await prisma.indisponibilite.count()).toBe(1);
    });

    it('répond 404 pour l’indisponibilité d’un autre technicien', async () => {
      const idKevin = await creerFiche(fixtures.kevin);
      const idMathieu = await creerFiche(fixtures.mathieu);
      const deMathieu = await gestionnaire()
        .post(url(idMathieu))
        .send(periode('2026-12-20T07:00:00', '2026-12-20T19:00:00'))
        .expect(201);

      await gestionnaire()
        .delete(`${url(idKevin)}/${deMathieu.body.id}`)
        .expect(404);
    });
  });
});
