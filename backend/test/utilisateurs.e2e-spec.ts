import request from 'supertest';
import type { UtilisateurConnecte } from '../src/commun/autorisation/utilisateur-connecte.js';
import {
  type ApplicationDeTest,
  creerCompte,
  demarrerApplication,
  requetesEn,
  viderLaBase,
} from './support/application-de-test.js';

/*
 * Tests d'intégration de la gestion des comptes (US03, US05, RG23), sur la base éphémère de
 * Testcontainers. L'utilisateur est simulé par l'en-tête de test ; la connexion avec le mot de
 * passe provisoire passe, elle, par la vraie route publique POST /auth/login.
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');

interface Comptes {
  admin: UtilisateurConnecte;
  gestionnaire: UtilisateurConnecte;
  technicien: UtilisateurConnecte;
  technicienAvecFiche: UtilisateurConnecte;
}

const NOUVEAU_COMPTE = { nom: 'Grondin', prenom: 'Mathieu', role: 'TECHNICIEN' };

describe('comptes utilisateurs (e2e)', () => {
  let application: ApplicationDeTest;
  let comptes: Comptes;

  const en = (utilisateur: UtilisateurConnecte) => requetesEn(application.app, utilisateur);
  const compteEnBase = (id: number) =>
    application.prisma.utilisateur.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    application = await demarrerApplication(MAINTENANT);
    const { prisma } = application;
    comptes = {
      admin: await creerCompte(prisma, {
        email: 'admin@test.re',
        nom: 'Bidel',
        prenom: 'Arnaud',
        role: 'ADMIN',
      }),
      gestionnaire: await creerCompte(prisma, {
        email: 'gestion@test.re',
        nom: 'Payet',
        prenom: 'Céline',
        role: 'GESTIONNAIRE',
      }),
      technicien: await creerCompte(prisma, {
        email: 'helene.hoarau@test.re',
        nom: 'Hoarau',
        prenom: 'Hélène',
        role: 'TECHNICIEN',
      }),
      technicienAvecFiche: await creerCompte(prisma, {
        email: 'kevin.techer@test.re',
        nom: 'Técher',
        prenom: 'Kévin',
        role: 'TECHNICIEN',
      }),
    };
    await prisma.technicien.create({
      data: {
        idUtilisateur: comptes.technicienAvecFiche.id,
        telephone: '0692123456',
        couleurPlanning: '#1E88E5',
      },
    });
  });

  afterAll(async () => {
    await viderLaBase(application.prisma);
    await application.app.close();
  });

  describe('création (US03, RG23)', () => {
    it('US03 : crée un compte dont le mot de passe provisoire, stocké haché, ouvre une session à changer', async () => {
      const reponse = await en(comptes.admin)
        .post('/users')
        .send({ ...NOUVEAU_COMPTE, email: 'Julie.Roche@Test.re', nom: 'Roche', prenom: 'Julie' })
        .expect(201);
      const { utilisateur, motDePasseProvisoire } = reponse.body as {
        utilisateur: { id: number };
        motDePasseProvisoire: string;
      };

      expect(reponse.body.utilisateur).toMatchObject({
        email: 'julie.roche@test.re',
        actif: true,
        mdpAChanger: true,
      });
      expect(reponse.body.utilisateur).not.toHaveProperty('motDePasseHash');
      const enBase = await compteEnBase(utilisateur.id);
      expect(enBase.motDePasseHash).toMatch(/^\$argon2id\$/);
      expect(enBase.motDePasseHash).not.toContain(motDePasseProvisoire);

      const connexion = await request(application.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'julie.roche@test.re', motDePasse: motDePasseProvisoire })
        .expect(200);
      expect(connexion.body.utilisateur).toMatchObject({ id: utilisateur.id, mdpAChanger: true });
    });

    it('RG23 : refuse en 409 un e-mail déjà utilisé, quelle que soit sa casse, sans créer de doublon', async () => {
      await en(comptes.admin)
        .post('/users')
        .send({ ...NOUVEAU_COMPTE, email: 'GESTION@test.re' })
        .expect(409);

      expect(
        await application.prisma.utilisateur.count({ where: { email: 'gestion@test.re' } }),
      ).toBe(1);
    });

    it('RG23 : deux créations simultanées du même e-mail donnent un 201 et un 409', async () => {
      const creer = () =>
        en(comptes.admin)
          .post('/users')
          .send({ ...NOUVEAU_COMPTE, email: 'simultane@test.re' });

      const reponses = await Promise.all([creer(), creer()]);

      expect(reponses.map((reponse) => reponse.status).sort()).toEqual([201, 409]);
      expect(
        await application.prisma.utilisateur.count({ where: { email: 'simultane@test.re' } }),
      ).toBe(1);
    });
  });

  describe('liste et droits (US03)', () => {
    it('US03 : liste les comptes, filtrés par rôle et cherchés sans tenir compte des accents', async () => {
      const parRole = await en(comptes.admin)
        .get('/users')
        .query({ role: 'TECHNICIEN' })
        .expect(200);
      expect(
        (parRole.body.data as { role: string }[]).every((compte) => compte.role === 'TECHNICIEN'),
      ).toBe(true);

      const recherche = await en(comptes.admin)
        .get('/users')
        .query({ recherche: 'helene' })
        .expect(200);
      expect((recherche.body.data as { email: string }[]).map((compte) => compte.email)).toEqual([
        'helene.hoarau@test.re',
      ]);
      expect(recherche.body.meta).toMatchObject({ page: 1, total: 1 });
      expect(recherche.body.data[0]).not.toHaveProperty('motDePasseHash');
    });

    it.each(['gestionnaire', 'technicien'] as const)(
      'US03 : répond 403 au %s sur la liste et la création des comptes',
      async (profil) => {
        await en(comptes[profil]).get('/users').expect(403);
        await en(comptes[profil])
          .post('/users')
          .send({ ...NOUVEAU_COMPTE, email: 'refuse@test.re' })
          .expect(403);

        expect(
          await application.prisma.utilisateur.count({ where: { email: 'refuse@test.re' } }),
        ).toBe(0);
      },
    );

    it('US03 : répond 404 pour un compte inexistant et 400 pour un identifiant invalide', async () => {
      await en(comptes.admin).get('/users/99999').expect(404);
      await en(comptes.admin).get('/users/abc').expect(400);
    });
  });

  describe('modification et désactivation (US03)', () => {
    it('US03 : un administrateur ne peut ni désactiver son compte ni retirer son propre rôle', async () => {
      await en(comptes.admin).post(`/users/${comptes.admin.id}/deactivate`).expect(400);
      await en(comptes.admin)
        .patch(`/users/${comptes.admin.id}`)
        .send({ role: 'GESTIONNAIRE' })
        .expect(400);

      expect(await compteEnBase(comptes.admin.id)).toMatchObject({ role: 'ADMIN', actif: true });
    });

    it('US03 : refuse en 409 de retirer le rôle technicien à un compte qui a une fiche technicien', async () => {
      await en(comptes.admin)
        .patch(`/users/${comptes.technicienAvecFiche.id}`)
        .send({ role: 'GESTIONNAIRE' })
        .expect(409);

      expect((await compteEnBase(comptes.technicienAvecFiche.id)).role).toBe('TECHNICIEN');
    });

    it('US03 : désactive puis réactive un compte', async () => {
      const desactive = await en(comptes.admin)
        .post(`/users/${comptes.technicien.id}/deactivate`)
        .expect(200);
      expect(desactive.body).toMatchObject({ id: comptes.technicien.id, actif: false });

      const reactive = await en(comptes.admin)
        .post(`/users/${comptes.technicien.id}/activate`)
        .expect(200);
      expect(reactive.body).toMatchObject({ id: comptes.technicien.id, actif: true });
    });
  });

  describe('son propre profil (US05)', () => {
    it('US05 : modifie son nom et son prénom, sans pouvoir changer son rôle ni son e-mail', async () => {
      const reponse = await en(comptes.gestionnaire)
        .patch('/users/me')
        .send({ nom: 'Payet-Grondin', prenom: 'Céline' })
        .expect(200);
      expect(reponse.body).toMatchObject({
        id: comptes.gestionnaire.id,
        nom: 'Payet-Grondin',
        role: 'GESTIONNAIRE',
      });

      await en(comptes.gestionnaire).patch('/users/me').send({ role: 'ADMIN' }).expect(400);
      await en(comptes.gestionnaire)
        .patch('/users/me')
        .send({ email: 'autre@test.re' })
        .expect(400);

      expect(await compteEnBase(comptes.gestionnaire.id)).toMatchObject({
        role: 'GESTIONNAIRE',
        email: 'gestion@test.re',
      });
    });

    it('US05 : consulte son profil sans jamais recevoir l’empreinte du mot de passe', async () => {
      const reponse = await en(comptes.technicien).get('/users/me').expect(200);

      expect(reponse.body).toMatchObject({
        id: comptes.technicien.id,
        email: 'helene.hoarau@test.re',
      });
      expect(reponse.body).not.toHaveProperty('motDePasseHash');
    });
  });
});
