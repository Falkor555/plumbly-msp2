import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { configurerApplication } from '../src/configurer-application.js';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { hacherJeton } from '../src/authentification/jetons.js';
import { hacherMotDePasse } from '../src/authentification/mots-de-passe.js';
import type { Role } from '../src/generated/prisma/client.ts';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { viderLaBase } from './support/application-de-test.js';

/*
 * Tests d'intégration de l'authentification (card #13), sur la base éphémère de Testcontainers.
 * Seul fichier de tests où le VRAI guard d'authentification est actif : chaque requête passe
 * par un vrai jeton, un vrai cookie et une vraie base, comme en production.
 */

const MOT_DE_PASSE = 'Plombier#2026!';
const IDENTIFIANTS_INCORRECTS = 'E-mail ou mot de passe incorrect.';

interface Comptes {
  gestionnaire: number;
  technicien: number;
  admin: number;
  desactive: number;
  changeraSonMotDePasse: number;
  seraDesactive: number;
}

interface Session {
  jeton: string;
  /** « refresh_token=valeur », prêt à renvoyer dans l'en-tête Cookie. */
  cookie: string;
}

/** Application complète ; la limitation des tentatives n'est active que si demandée. */
async function demarrer(limiterLesTentatives: boolean): Promise<INestApplication<App>> {
  let constructeur = Test.createTestingModule({ imports: [AppModule] });
  if (!limiterLesTentatives) {
    constructeur = constructeur.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  const module = await constructeur.compile();
  const app = module.createNestApplication<NestExpressApplication>();
  // Mêmes réglages que main.ts : Helmet, cookies, préfixe des routes et limites du corps JSON.
  configurerApplication(app);
  await app.init();
  return app as INestApplication<App>;
}

async function creerCompte(
  prisma: PrismaService,
  email: string,
  role: Role,
  actif = true,
): Promise<number> {
  const compte = await prisma.utilisateur.create({
    data: {
      email,
      nom: 'Test',
      prenom: role,
      role,
      actif,
      mdpAChanger: false,
      motDePasseHash: await hacherMotDePasse(MOT_DE_PASSE),
    },
  });
  return compte.id;
}

/** Le cookie refresh_token complet, tel que l'API l'a posé (avec ses attributs). */
function cookiePose(reponse: request.Response): string {
  const cookies = ([] as string[]).concat(reponse.headers['set-cookie'] ?? []);
  const cookie = cookies.find((ligne) => ligne.startsWith('refresh_token='));
  if (cookie === undefined) {
    throw new Error('La réponse ne pose pas de cookie refresh_token.');
  }
  return cookie;
}

describe('authentification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let comptes: Comptes;

  const api = () => request(app.getHttpServer());

  async function connecter(email: string, motDePasse = MOT_DE_PASSE): Promise<Session> {
    const reponse = await api().post('/api/v1/auth/login').send({ email, motDePasse }).expect(200);
    return {
      jeton: reponse.body.accessToken as string,
      cookie: cookiePose(reponse).split(';')[0],
    };
  }

  beforeAll(async () => {
    app = await demarrer(false);
    prisma = app.get(PrismaService);
    await viderLaBase(prisma);
    comptes = {
      gestionnaire: await creerCompte(prisma, 'sophie.martin@test.re', 'GESTIONNAIRE'),
      technicien: await creerCompte(prisma, 'karim.benali@test.re', 'TECHNICIEN'),
      admin: await creerCompte(prisma, 'michel.durand@test.re', 'ADMIN'),
      desactive: await creerCompte(prisma, 'ancien.employe@test.re', 'TECHNICIEN', false),
      changeraSonMotDePasse: await creerCompte(prisma, 'julie.roche@test.re', 'GESTIONNAIRE'),
      seraDesactive: await creerCompte(prisma, 'paul.payet@test.re', 'TECHNICIEN'),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  describe('en-têtes de sécurité (Helmet)', () => {
    it('ne révèlent pas la technologie du serveur et protègent le navigateur', async () => {
      const reponse = await api().get('/api/v1').expect(200);

      expect(reponse.headers['x-powered-by']).toBeUndefined();
      expect(reponse.headers['x-content-type-options']).toBe('nosniff');
      expect(reponse.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(reponse.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });

  describe('POST /auth/login (US01)', () => {
    it('ouvre une session : jeton d’accès, profil et cookie sécurisé', async () => {
      const reponse = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'sophie.martin@test.re', motDePasse: MOT_DE_PASSE })
        .expect(200);

      expect(reponse.body).toMatchObject({
        expiresIn: 900,
        utilisateur: { id: comptes.gestionnaire, role: 'GESTIONNAIRE', mdpAChanger: false },
      });
      expect(reponse.body.utilisateur).not.toHaveProperty('motDePasseHash');
      const cookie = cookiePose(reponse);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/api/v1/auth');
    });

    it('stocke le jeton de rafraîchissement haché, jamais en clair', async () => {
      const { cookie } = await connecter('sophie.martin@test.re');
      const jeton = cookie.slice('refresh_token='.length);

      expect(await prisma.jetonRafraichissement.count({ where: { hashJeton: jeton } })).toBe(0);
      expect(
        await prisma.jetonRafraichissement.count({ where: { hashJeton: hacherJeton(jeton) } }),
      ).toBe(1);
    });

    it('accepte l’e-mail quelle que soit la casse', async () => {
      await connecter('Sophie.Martin@Test.re');
    });

    it('TI01 : même réponse pour un mot de passe faux, un e-mail inconnu ou un compte désactivé', async () => {
      const essais = [
        { email: 'sophie.martin@test.re', motDePasse: 'Mauvais#MotDePasse1' },
        { email: 'inconnu@test.re', motDePasse: MOT_DE_PASSE },
        { email: 'ancien.employe@test.re', motDePasse: MOT_DE_PASSE },
      ];
      for (const essai of essais) {
        const reponse = await api().post('/api/v1/auth/login').send(essai).expect(401);
        expect(reponse.body).toEqual({
          statusCode: 401,
          message: IDENTIFIANTS_INCORRECTS,
          error: 'Unauthorized',
        });
        expect(reponse.headers['set-cookie']).toBeUndefined();
      }
    });

    it('refuse un corps invalide avec un 400', async () => {
      await api().post('/api/v1/auth/login').send({ email: 'pas-un-email' }).expect(400);
    });
  });

  describe('routes protégées', () => {
    it('répondent 401 sans jeton', async () => {
      await api().get('/api/v1/users/me').expect(401);
    });

    it('répondent 401 avec un jeton falsifié', async () => {
      await api()
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOjEsInJvbGUiOiJBRE1JTiJ9.')
        .expect(401);
    });

    it('identifient l’utilisateur par son jeton', async () => {
      const { jeton } = await connecter('sophie.martin@test.re');
      const reponse = await api()
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${jeton}`)
        .expect(200);
      expect(reponse.body).toMatchObject({ id: comptes.gestionnaire, role: 'GESTIONNAIRE' });
    });

    it('TI02 : un technicien authentifié reçoit 403 sur GET /clients', async () => {
      const technicien = await connecter('karim.benali@test.re');
      const gestionnaire = await connecter('sophie.martin@test.re');

      await api()
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${technicien.jeton}`)
        .expect(403);
      await api()
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${gestionnaire.jeton}`)
        .expect(200);
    });
  });

  describe('POST /auth/refresh : rotation', () => {
    it('remplace le cookie par un nouveau et renvoie un nouveau jeton d’accès', async () => {
      const { cookie } = await connecter('sophie.martin@test.re');

      const reponse = await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);

      expect(reponse.body).toMatchObject({ expiresIn: 900 });
      expect(cookiePose(reponse).split(';')[0]).not.toBe(cookie);
    });

    it('coupe toutes les sessions si un ancien jeton est réutilisé (vol probable)', async () => {
      const { cookie: ancien } = await connecter('sophie.martin@test.re');
      const rafraichi = await api().post('/api/v1/auth/refresh').set('Cookie', ancien).expect(200);
      const nouveau = cookiePose(rafraichi).split(';')[0];

      // Un attaquant rejoue l'ancien jeton : refusé…
      await api().post('/api/v1/auth/refresh').set('Cookie', ancien).expect(401);
      // …et la session légitime est coupée aussi.
      await api().post('/api/v1/auth/refresh').set('Cookie', nouveau).expect(401);
    });

    it('répond 401 sans cookie', async () => {
      await api().post('/api/v1/auth/refresh').expect(401);
    });
  });

  describe('fin de session', () => {
    it('POST /auth/logout (US02) révoque la session et vide le cookie', async () => {
      const { jeton, cookie } = await connecter('sophie.martin@test.re');

      const reponse = await api()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${jeton}`)
        .set('Cookie', cookie)
        .expect(204);

      expect(cookiePose(reponse)).toMatch(/^refresh_token=;/);
      await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('un changement de mot de passe coupe les sessions ouvertes', async () => {
      const { jeton, cookie } = await connecter('julie.roche@test.re');

      await api()
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${jeton}`)
        .send({ ancienMotDePasse: MOT_DE_PASSE, nouveauMotDePasse: 'Nouveau#MotDePasse2' })
        .expect(204);

      await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'julie.roche@test.re', motDePasse: MOT_DE_PASSE })
        .expect(401);
      await connecter('julie.roche@test.re', 'Nouveau#MotDePasse2');
    });

    it('la désactivation par l’administrateur coupe les sessions du compte (US03)', async () => {
      const victime = await connecter('paul.payet@test.re');
      const admin = await connecter('michel.durand@test.re');

      await api()
        .post(`/api/v1/users/${comptes.seraDesactive}/deactivate`)
        .set('Authorization', `Bearer ${admin.jeton}`)
        .expect(200);

      await api().post('/api/v1/auth/refresh').set('Cookie', victime.cookie).expect(401);
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'paul.payet@test.re', motDePasse: MOT_DE_PASSE })
        .expect(401);
    });
  });
});

describe('limitation des tentatives de connexion (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Application à part, limitation active : son compteur de tentatives est neuf.
    app = await demarrer(true);
    const prisma = app.get(PrismaService);
    await viderLaBase(prisma);
    await creerCompte(prisma, 'sophie.martin@test.re', 'GESTIONNAIRE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('répond 429 à la 6e tentative en 15 minutes, même avec le bon mot de passe', async () => {
    const api = () => request(app.getHttpServer());
    for (let essai = 1; essai <= 5; essai += 1) {
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'sophie.martin@test.re', motDePasse: 'Mauvais#MotDePasse1' })
        .expect(401);
    }
    const reponse = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'sophie.martin@test.re', motDePasse: MOT_DE_PASSE })
      .expect(429);
    expect(reponse.body.message).toBe(
      'Trop de tentatives de connexion : réessayer dans 15 minutes.',
    );
  });
});
