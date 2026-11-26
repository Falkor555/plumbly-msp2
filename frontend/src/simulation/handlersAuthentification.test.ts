import { beforeEach, describe, expect, it } from 'vitest';
import { serveurApi, urlApi } from '../test/msw/serveur';
import {
  COMPTES_DEMONSTRATION,
  GESTIONNAIRE_DEMONSTRATION,
  TECHNICIEN_DEMONSTRATION,
} from './comptesDemonstration';
import { compteConnecte, creerHandlersAuthentification } from './handlersAuthentification';

const JETON = 'jeton-de-demonstration';

function installerLesHandlers(): void {
  serveurApi.use(...creerHandlersAuthentification(COMPTES_DEMONSTRATION, { urlApi }));
}

function appeler(
  methode: 'GET' | 'POST',
  chemin: string,
  options: { corps?: unknown; jeton?: string } = {},
): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.corps !== undefined) headers.set('Content-Type', 'application/json');
  if (options.jeton) headers.set('Authorization', `Bearer ${options.jeton}`);
  return fetch(urlApi(chemin), {
    method: methode,
    headers,
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
  });
}

function seConnecter(email: string, motDePasse = 'nimporte-quoi'): Promise<Response> {
  return appeler('POST', '/auth/login', { corps: { email, motDePasse } });
}

beforeEach(() => {
  // La session simulée survit à un rechargement via sessionStorage : chaque test repart de zéro.
  sessionStorage.clear();
  installerLesHandlers();
});

describe('POST /auth/login simulé', () => {
  it('US01 : connecte un e-mail connu avec un mot de passe quelconque non vide et renvoie le profil exact', async () => {
    const reponse = await seConnecter(GESTIONNAIRE_DEMONSTRATION.email, 'x');

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({
      accessToken: JETON,
      expiresIn: 900,
      utilisateur: GESTIONNAIRE_DEMONSTRATION,
    });
    expect(compteConnecte()).toEqual(GESTIONNAIRE_DEMONSTRATION);
  });

  it('US01 : accepte l’e-mail quelle que soit sa casse, comme le back qui le met en minuscules', async () => {
    const reponse = await seConnecter(' Technicien@Plumbly.demo ');

    expect(reponse.status).toBe(200);
    expect((await reponse.json()).utilisateur).toEqual(TECHNICIEN_DEMONSTRATION);
  });

  it('US01 : répond 401 avec le message du back à un e-mail inconnu, sans ouvrir de session', async () => {
    const reponse = await seConnecter('inconnu@plumbly.demo');

    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({
      statusCode: 401,
      message: 'E-mail ou mot de passe incorrect.',
    });
    expect(compteConnecte()).toBeNull();
  });

  it('US01 : répond 400 avec le message du back à un mot de passe vide', async () => {
    const reponse = await seConnecter(GESTIONNAIRE_DEMONSTRATION.email, '');

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({
      statusCode: 400,
      message: ['motDePasse est obligatoire'],
    });
    expect(compteConnecte()).toBeNull();
  });

  it('US01 : répond 400 avec le message du back à un e-mail vide ou fait d’espaces', async () => {
    const reponse = await seConnecter('   ');

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({
      statusCode: 400,
      message: ['email ne peut pas être vide'],
    });
  });

  it('US01 : répond 400 avec le message du back à un e-mail mal formé, sans ouvrir de session', async () => {
    const reponse = await seConnecter('abc');

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({
      statusCode: 400,
      message: ['email doit être une adresse e-mail valide'],
    });
    expect(compteConnecte()).toBeNull();
  });

  it('US01 : répond 400 à un corps sans e-mail ni mot de passe, une erreur par champ', async () => {
    const reponse = await appeler('POST', '/auth/login', { corps: {} });

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({
      statusCode: 400,
      message: ['email est obligatoire', 'motDePasse est obligatoire'],
    });
  });

  it('US01 : refuse en 400 un champ inconnu dans le corps, comme lireObjet du back', async () => {
    const reponse = await appeler('POST', '/auth/login', {
      corps: { email: GESTIONNAIRE_DEMONSTRATION.email, motDePasse: 'x', souvenir: true },
    });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).message).toEqual(['Le champ souvenir n’est pas autorisé']);
    expect(compteConnecte()).toBeNull();
  });

  it('US01 : répond 400 à un corps qui n’est pas un objet JSON', async () => {
    const reponse = await appeler('POST', '/auth/login', { corps: ['gestion@plumbly.demo'] });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).message).toEqual([
      'Le corps de la requête doit être un objet JSON',
    ]);
  });
});

describe('session simulée', () => {
  it('US01 : GET /users/me sans session répond 401 avec le message du guard', async () => {
    const reponse = await appeler('GET', '/users/me', { jeton: JETON });

    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ statusCode: 401, message: 'Authentification requise.' });
  });

  it('US01 : POST /auth/refresh sans session répond 401 avec le message du back', async () => {
    const reponse = await appeler('POST', '/auth/refresh');

    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({
      statusCode: 401,
      message: 'Session expirée : se reconnecter.',
    });
  });

  it('US01 : après la connexion, refresh renvoie un jeton puis /users/me l’objet Utilisateur du compte', async () => {
    await seConnecter(TECHNICIEN_DEMONSTRATION.email);

    const rafraichissement = await appeler('POST', '/auth/refresh');
    const profil = await appeler('GET', '/users/me', { jeton: JETON });

    expect(rafraichissement.status).toBe(200);
    expect(await rafraichissement.json()).toEqual({ accessToken: JETON, expiresIn: 900 });
    expect(profil.status).toBe(200);
    // Objet Utilisateur complet du contrat (6.2), pas seulement le Profil.
    expect(await profil.json()).toEqual({
      ...TECHNICIEN_DEMONSTRATION,
      actif: true,
      derniereConnexion: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      creeLe: '2026-01-05T04:00:00.000Z',
    });
  });

  it('US01 : GET /users/me avec une session mais sans jeton répond 401, comme le guard du back', async () => {
    await seConnecter(GESTIONNAIRE_DEMONSTRATION.email);

    const reponse = await appeler('GET', '/users/me');

    expect(reponse.status).toBe(401);
  });

  it('US01 : une nouvelle instance des handlers avec le même sessionStorage retrouve la session (rechargement)', async () => {
    await seConnecter(GESTIONNAIRE_DEMONSTRATION.email);

    installerLesHandlers();
    const reponse = await appeler('POST', '/auth/refresh');

    expect(reponse.status).toBe(200);
    expect(compteConnecte()).toEqual(GESTIONNAIRE_DEMONSTRATION);
  });

  it('US02 : POST /auth/logout répond 204, ferme la session et /users/me répond ensuite 401', async () => {
    await seConnecter(GESTIONNAIRE_DEMONSTRATION.email);

    const deconnexion = await appeler('POST', '/auth/logout', { jeton: JETON });
    const profil = await appeler('GET', '/users/me', { jeton: JETON });

    expect(deconnexion.status).toBe(204);
    expect(profil.status).toBe(401);
    expect(compteConnecte()).toBeNull();
    expect(sessionStorage.getItem('plumbly-simulation.compte')).toBeNull();
  });

  it('US02 : POST /auth/logout sans jeton répond 401 et laisse la session ouverte', async () => {
    await seConnecter(GESTIONNAIRE_DEMONSTRATION.email);

    const reponse = await appeler('POST', '/auth/logout');

    expect(reponse.status).toBe(401);
    expect(compteConnecte()).toEqual(GESTIONNAIRE_DEMONSTRATION);
  });
});
