import { beforeEach, describe, expect, it } from 'vitest';
import type { FicheTechnicien, Indisponibilite, ListePaginee, Planning } from '../api/types';
import type { CompteUtilisateur } from '../api/utilisateurs.api';
import { appeler, statutEtCorps } from '../test/appelerLaSimulation';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { ADMINISTRATEUR_DE_TEST } from '../test/session';
import {
  COMPTES_DEMONSTRATION,
  GESTIONNAIRE_DEMONSTRATION,
  UTILISATEUR_ID_FABRICE_LEBON,
  UTILISATEUR_ID_JULIE_ROCHE,
  UTILISATEUR_ID_MARIE_TECHER,
  UTILISATEUR_ID_SEBASTIEN_PAYET,
} from './comptesDemonstration';
import { creerJeuDeDemonstration, type JeuDeDemonstration } from './donneesDemonstration';
import { creerHandlersAuthentification } from './handlersAuthentification';
import { creerHandlersPlanning } from './handlersPlanning';
import { choisirCouleur, creerHandlersTechniciens, PALETTE_PLANNING } from './handlersTechniciens';

/** Lundi 23 novembre 2026 ; « maintenant » est le mercredi 25 à 10 h, heure de La Réunion. */
const LUNDI = '2026-11-23';
const JEUDI = '2026-11-26';
const MAINTENANT = new Date('2026-11-25T06:00:00.000Z');

const JEAN = 1;
const MARIE = 2;
const PAUL = 3;
const SEBASTIEN_ARCHIVE = 4;

let jeu: JeuDeDemonstration;
let maintenant: Date;

beforeEach(() => {
  maintenant = MAINTENANT;
  jeu = creerJeuDeDemonstration(LUNDI);
  // La session simulée survit à un rechargement via sessionStorage : chaque test repart de zéro.
  sessionStorage.clear();
  serveurApi.use(
    ...creerHandlersAuthentification(COMPTES_DEMONSTRATION, { urlApi }),
    ...creerHandlersTechniciens(jeu, { urlApi, maintenant: () => maintenant }),
    ...creerHandlersPlanning(jeu, { urlApi, aujourdhui: () => LUNDI }),
  );
});

async function lireFiches(parametres = ''): Promise<ListePaginee<FicheTechnicien>> {
  const reponse = await appeler('GET', `/technicians${parametres}`);
  expect(reponse.status).toBe(200);
  return (await reponse.json()) as ListePaginee<FicheTechnicien>;
}

function nomsComplets(liste: ListePaginee<{ nom: string; prenom: string }>): string[] {
  return liste.data.map(({ prenom, nom }) => `${prenom} ${nom}`);
}

async function techniciensDuPlanning(): Promise<string[]> {
  const reponse = await appeler('GET', `/tours?du=${LUNDI}&au=2026-11-28`);
  const planning = (await reponse.json()) as Planning;
  return planning.techniciens.map(({ prenom, nom }) => `${prenom} ${nom}`);
}

describe('GET /technicians simulé (US11)', () => {
  it('US11 : liste les fiches en service triées par nom, avec les champs du compte et sans les tournées', async () => {
    const liste = await lireFiches();

    expect(nomsComplets(liste)).toEqual(['Paul Lebon', 'Jean Rivière', 'Marie Técher']);
    expect(liste.data[1]).toEqual({
      id: JEAN,
      utilisateurId: 4,
      nom: 'Rivière',
      prenom: 'Jean',
      email: 'technicien@plumbly.demo',
      compteActif: true,
      telephone: '0692111111',
      couleurPlanning: '#0F766E',
      archive: false,
      archiveLe: null,
    });
    expect(liste.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
  });

  it('US11 : inclut la fiche archivée avec archives=true, et trie à rebours avec -nom', async () => {
    const avecArchives = await lireFiches('?archives=true');
    const aRebours = await lireFiches('?tri=-nom');

    expect(nomsComplets(avecArchives)).toEqual([
      'Paul Lebon',
      'Sébastien Payet',
      'Jean Rivière',
      'Marie Técher',
    ]);
    expect(nomsComplets(aRebours)).toEqual(['Marie Técher', 'Jean Rivière', 'Paul Lebon']);
  });

  it('US11 : la recherche sans accent porte sur le nom, le prénom et « prénom nom »', async () => {
    const parLeNom = await lireFiches('?recherche=techer');
    const prenomEtNom = await lireFiches('?recherche=jean%20riv');

    expect(nomsComplets(parLeNom)).toEqual(['Marie Técher']);
    expect(nomsComplets(prenomEtNom)).toEqual(['Jean Rivière']);
  });

  it('US11 : répond 400 avec les messages exacts à un tri inconnu et à une recherche trop courte', async () => {
    const reponse = await appeler('GET', '/technicians?tri=prenom&recherche=j');

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 400,
      corps: {
        statusCode: 400,
        message: ['tri doit valoir nom, -nom', 'recherche doit contenir au moins 2 caractères'],
      },
    });
  });
});

describe('choix de la couleur du planning à la création (US11)', () => {
  it('US11 : prend la première couleur de la palette encore libre, sans tenir compte de la casse', () => {
    expect(choisirCouleur([])).toBe('#0F766E');
    expect(choisirCouleur(['#0f766e', '#1E88E5', '#7B1FA2'])).toBe('#AF4C00');
  });

  it('US11 : ignore une couleur choisie hors de la palette', () => {
    expect(choisirCouleur(['#4F46E5'])).toBe('#0F766E');
  });

  it('US11 : quand toute la palette est prise, prend la moins utilisée, la première en cas d’égalité', () => {
    const saufLeVert = [...PALETTE_PLANNING, ...PALETTE_PLANNING.filter((c) => c !== '#2E7D32')];

    expect(choisirCouleur(saufLeVert)).toBe('#2E7D32');
    expect(choisirCouleur([...PALETTE_PLANNING])).toBe('#0F766E');
  });
});

describe('POST /technicians simulé (US11)', () => {
  it('US11 : crée la fiche d’un compte technicien libre, choisit une couleur libre de la palette et l’ajoute au planning', async () => {
    const reponse = await appeler('POST', '/technicians', {
      utilisateurId: UTILISATEUR_ID_JULIE_ROCHE,
      telephone: '0692 55 55 55',
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 201,
      corps: {
        id: 5,
        utilisateurId: UTILISATEUR_ID_JULIE_ROCHE,
        nom: 'Roche',
        prenom: 'Julie',
        email: 'julie.roche@plumbly.demo',
        compteActif: true,
        telephone: '0692555555',
        // #0F766E et #AF4C00 sont pris par Jean et Marie : la première couleur libre suit.
        couleurPlanning: '#1E88E5',
        archive: false,
        archiveLe: null,
      },
    });
    expect(await techniciensDuPlanning()).toContain('Julie Roche');
  });

  it('US11 : répond 409 avec le message exact quand le compte a déjà une fiche, archivée ou non', async () => {
    const enService = await appeler('POST', '/technicians', {
      utilisateurId: UTILISATEUR_ID_MARIE_TECHER,
      telephone: '0692000000',
    });
    const archivee = await appeler('POST', '/technicians', {
      utilisateurId: UTILISATEUR_ID_SEBASTIEN_PAYET,
      telephone: '0692000000',
    });

    expect(await statutEtCorps(enService)).toEqual({
      statut: 409,
      corps: { statusCode: 409, message: 'Ce compte a déjà une fiche technicien.' },
    });
    expect(archivee.status).toBe(409);
    expect(jeu.techniciens).toHaveLength(4);
  });

  it('US11 : répond 400 avec le message exact pour un compte d’un autre rôle, désactivé ou inexistant', async () => {
    const gestionnaire = await appeler('POST', '/technicians', {
      utilisateurId: GESTIONNAIRE_DEMONSTRATION.id,
      telephone: '0692000000',
    });
    const desactive = await appeler('POST', '/technicians', {
      utilisateurId: UTILISATEUR_ID_FABRICE_LEBON,
      telephone: '0692000000',
    });
    const inexistant = await appeler('POST', '/technicians', {
      utilisateurId: 999,
      telephone: '0692000000',
    });

    expect(await statutEtCorps(gestionnaire)).toEqual({
      statut: 400,
      corps: {
        statusCode: 400,
        message:
          'Ce compte a le rôle GESTIONNAIRE : seul un compte TECHNICIEN peut avoir une fiche technicien.',
      },
    });
    expect((await desactive.json()).message).toBe(
      'Ce compte utilisateur est désactivé : réactivez-le avant de créer sa fiche technicien.',
    );
    expect((await inexistant.json()).message).toBe('Le compte utilisateur indiqué n’existe pas.');
  });

  it('US11 : refuse en 400 tableau un identifiant envoyé en texte et une couleur mal formée', async () => {
    const reponse = await appeler('POST', '/technicians', {
      utilisateurId: '8',
      telephone: '0692000000',
      couleurPlanning: 'bleu',
    });

    expect((await reponse.json()).message).toEqual([
      'utilisateurId doit être un entier positif',
      'couleurPlanning doit être une couleur au format #RRGGBB',
    ]);
  });
});

describe('fiche, modification et archivage simulés (US11, RG22)', () => {
  it('US11 : GET /technicians/:id renvoie une fiche archivée, 404 pour un inconnu', async () => {
    const archivee = await appeler('GET', `/technicians/${SEBASTIEN_ARCHIVE}`);
    const inconnue = await appeler('GET', '/technicians/99');

    expect(await archivee.json()).toMatchObject({ prenom: 'Sébastien', archive: true });
    expect(await statutEtCorps(inconnue)).toEqual({
      statut: 404,
      corps: { statusCode: 404, message: 'Technicien introuvable.' },
    });
  });

  it('US11 : PATCH refuse les champs du compte avec le message exact, avant tout autre contrôle', async () => {
    const reponse = await appeler('PATCH', `/technicians/${JEAN}`, {
      nom: 'Riviere',
      email: 'jean@plumbly.demo',
      telephone: '0692000000',
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 400,
      corps: {
        statusCode: 400,
        message: [
          'nom vient du compte utilisateur : il se modifie par PATCH /users/:id',
          'email vient du compte utilisateur : il se modifie par PATCH /users/:id',
        ],
      },
    });
  });

  it('US11 : PATCH met la couleur en majuscules et le téléphone au format à 10 chiffres', async () => {
    const reponse = await appeler('PATCH', `/technicians/${JEAN}`, {
      couleurPlanning: '#1e88e5',
      telephone: '06.92.99.99.99',
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 200,
      corps: expect.objectContaining({ couleurPlanning: '#1E88E5', telephone: '0692999999' }),
    });
  });

  it('US11 : PATCH d’une fiche archivée répond 400 avec le message exact', async () => {
    const reponse = await appeler('PATCH', `/technicians/${SEBASTIEN_ARCHIVE}`, {
      telephone: '0692000000',
    });

    expect((await reponse.json()).message).toBe(
      'Ce technicien est archivé : sa fiche ne peut plus être modifiée.',
    );
  });

  it('RG22 : refuse en 409 d’archiver un technicien qui a une intervention en cours, en la comptant', async () => {
    // Le mercredi, Jean n'a plus que l'intervention restée « en cours » du lundi.
    const reponse = await appeler('POST', `/technicians/${JEAN}/archive`);

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 409,
      corps: {
        statusCode: 409,
        message:
          'Impossible d’archiver ce technicien tant qu’il a des interventions en cours ou planifiées à partir d’aujourd’hui (1 actuellement) : retirez-les de ses tournées d’abord.',
      },
    });
  });

  it('RG22 : compte aussi une intervention planifiée dans une tournée d’un jour suivant', async () => {
    // Le lundi, Marie a encore le remplacement de robinet planifié le mardi.
    maintenant = new Date('2026-11-23T06:00:00.000Z');

    const reponse = await appeler('POST', `/technicians/${MARIE}/archive`);

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 409,
      corps: {
        statusCode: 409,
        message:
          'Impossible d’archiver ce technicien tant qu’il a des interventions en cours ou planifiées à partir d’aujourd’hui (1 actuellement) : retirez-les de ses tournées d’abord.',
      },
    });
    expect(jeu.techniciens[MARIE - 1].archive).toBe(false);
  });

  it('RG22 : archive un technicien sans intervention à venir, qui sort alors du planning', async () => {
    const archivage = await appeler('POST', `/technicians/${PAUL}/archive`);
    const second = await appeler('POST', `/technicians/${PAUL}/archive`);

    expect(await statutEtCorps(archivage)).toEqual({
      statut: 200,
      corps: expect.objectContaining({ archive: true, archiveLe: MAINTENANT.toISOString() }),
    });
    expect((await second.json()).message).toBe('Ce technicien est déjà archivé.');
    expect(await techniciensDuPlanning()).toEqual(['Jean Rivière', 'Marie Técher']);
  });
});

describe('indisponibilités simulées (US12, RG10)', () => {
  async function lireIndisponibilites(id: number, parametres = ''): Promise<Indisponibilite[]> {
    const reponse = await appeler('GET', `/technicians/${id}/unavailabilities${parametres}`);
    expect(reponse.status).toBe(200);
    return (await reponse.json()) as Indisponibilite[];
  }

  it('US12 : sans période, renvoie les indisponibilités qui finissent après maintenant', async () => {
    const aVenir = await lireIndisponibilites(MARIE);
    maintenant = new Date('2026-11-27T06:00:00.000Z');
    const apresLaFormation = await lireIndisponibilites(MARIE);

    expect(aVenir).toEqual([
      {
        id: 2,
        debut: '2026-11-26T03:00:00.000Z',
        fin: '2026-11-26T15:00:00.000Z',
        motif: 'Formation',
      },
      {
        id: 4,
        debut: '2026-12-03T03:00:00.000Z',
        fin: '2026-12-03T08:00:00.000Z',
        motif: 'Récupération',
      },
    ]);
    expect(apresLaFormation.map(({ id }) => id)).toEqual([4]);
  });

  it('US12 : du et au bornent sur des jours de La Réunion, au inclus ; du seul remonte le passé', async () => {
    // Le jeudi 26 à 01:00 à La Réunion, c'est encore le mercredi 25 à 21:00 en UTC.
    jeu.techniciens[MARIE - 1].indisponibilites.push({
      id: 50,
      debut: '2026-11-25T21:00:00.000Z',
      fin: '2026-11-25T22:00:00.000Z',
      motif: 'Peu après minuit',
    });
    maintenant = new Date('2026-12-01T06:00:00.000Z');

    const periode = await lireIndisponibilites(MARIE, `?du=${LUNDI}&au=${JEUDI}`);
    const horsPeriode = await lireIndisponibilites(MARIE, `?du=${LUNDI}&au=2026-11-25`);
    const leJeudi = await lireIndisponibilites(MARIE, `?du=${JEUDI}&au=${JEUDI}`);
    const depuisLundi = await lireIndisponibilites(MARIE, `?du=${LUNDI}`);

    expect(periode.map(({ motif }) => motif)).toEqual(['Peu après minuit', 'Formation']);
    expect(horsPeriode).toEqual([]);
    expect(leJeudi.map(({ motif }) => motif)).toEqual(['Peu après minuit', 'Formation']);
    expect(depuisLundi.map(({ motif }) => motif)).toEqual([
      'Peu après minuit',
      'Formation',
      'Récupération',
    ]);
  });

  it('US12 : répond 400 avec les messages exacts à une date mal formée ou inexistante, et à du après au', async () => {
    const malFormee = await appeler('GET', `/technicians/${MARIE}/unavailabilities?du=2026-02-30`);
    const inversee = await appeler(
      'GET',
      `/technicians/${MARIE}/unavailabilities?du=${JEUDI}&au=${LUNDI}`,
    );

    expect((await malFormee.json()).message).toEqual(['du doit être une date AAAA-MM-JJ']);
    expect((await inversee.json()).message).toEqual(['du doit précéder au']);
  });

  it('US12 : ajoute une indisponibilité (201) sans motif, puis la liste', async () => {
    const reponse = await appeler('POST', `/technicians/${PAUL}/unavailabilities`, {
      debut: '2026-11-28T08:00+04:00',
      fin: '2026-11-28T12:00:00+04:00',
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 201,
      corps: {
        id: 5,
        debut: '2026-11-28T04:00:00.000Z',
        fin: '2026-11-28T08:00:00.000Z',
        motif: null,
      },
    });
    expect((await lireIndisponibilites(PAUL)).map(({ id }) => id)).toEqual([5, 3]);
  });

  it('RG10 : refuse en 409 une période qui recouvre une intervention planifiée, en la citant comme le back', async () => {
    const reponse = await appeler('POST', `/technicians/${JEAN}/unavailabilities`, {
      debut: '2026-11-23T08:30:00+04:00',
      fin: '2026-11-23T09:30:00+04:00',
      motif: 'Rendez-vous',
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 409,
      corps: {
        statusCode: 409,
        message:
          'La période recouvre une intervention planifiée ou en cours du technicien : n° 1 le 23/11/2026 de 08:00 à 09:00. Retirez-la de sa tournée ou déplacez-la d’abord.',
      },
    });
    expect(jeu.techniciens[0].indisponibilites).toHaveLength(1);
  });

  it('RG10 : refuse en 409 une période qui recouvre plusieurs interventions, en les citant toutes au pluriel', async () => {
    const reponse = await appeler('POST', `/technicians/${JEAN}/unavailabilities`, {
      debut: '2026-11-23T07:30:00+04:00',
      fin: '2026-11-23T11:00:00+04:00',
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 409,
      corps: {
        statusCode: 409,
        message:
          'La période recouvre des interventions planifiées ou en cours du technicien : n° 1 le 23/11/2026 de 08:00 à 09:00, n° 2 le 23/11/2026 de 10:00 à 11:30. Retirez-les de sa tournée ou déplacez-les d’abord.',
      },
    });
  });

  it('RG10 : une période contiguë à une intervention est acceptée (chevauchement strict)', async () => {
    const reponse = await appeler('POST', `/technicians/${JEAN}/unavailabilities`, {
      debut: '2026-11-23T09:00:00+04:00',
      fin: '2026-11-23T10:00:00+04:00',
    });

    expect(reponse.status).toBe(201);
  });

  it('US12 : refuse en 409 une période qui recouvre une autre indisponibilité, en la citant', async () => {
    const reponse = await appeler('POST', `/technicians/${MARIE}/unavailabilities`, {
      debut: `${JEUDI}T10:00:00+04:00`,
      fin: `${JEUDI}T12:00:00+04:00`,
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 409,
      corps: {
        statusCode: 409,
        message:
          'La période recouvre une autre indisponibilité du technicien : du 26/11/2026 07:00 au 26/11/2026 19:00.',
      },
    });
  });

  it('US12 : répond 400 tableau à une date-heure sans fuseau, à une fin avant le début et à un motif vide', async () => {
    const sansFuseau = await appeler('POST', `/technicians/${PAUL}/unavailabilities`, {
      debut: '2026-11-28T08:00:00',
      fin: '2026-11-28T12:00:00+04:00',
    });
    const inversee = await appeler('POST', `/technicians/${PAUL}/unavailabilities`, {
      debut: '2026-11-28T12:00:00+04:00',
      fin: '2026-11-28T08:00:00+04:00',
      motif: '',
    });

    expect((await sansFuseau.json()).message).toEqual([
      'debut doit être une date-heure ISO 8601 avec fuseau, par exemple 2026-12-08T08:00:00+04:00',
    ]);
    expect((await inversee.json()).message).toEqual([
      'motif ne peut pas être vide',
      'fin doit être postérieure à debut',
    ]);
  });

  it('US12 : refuse en 400 d’ajouter une indisponibilité à un technicien archivé', async () => {
    const reponse = await appeler('POST', `/technicians/${SEBASTIEN_ARCHIVE}/unavailabilities`, {
      debut: '2026-11-28T08:00:00+04:00',
      fin: '2026-11-28T12:00:00+04:00',
    });

    expect((await reponse.json()).message).toBe(
      'Ce technicien est archivé : on ne peut plus lui ajouter d’indisponibilité.',
    );
  });

  it('US12 : DELETE répond 204 et retire l’indisponibilité ; 404 si elle n’est pas à ce technicien', async () => {
    const suppression = await appeler('DELETE', `/technicians/${MARIE}/unavailabilities/2`);
    const autreTechnicien = await appeler('DELETE', `/technicians/${PAUL}/unavailabilities/2`);

    expect(suppression.status).toBe(204);
    expect((await lireIndisponibilites(MARIE)).map(({ id }) => id)).toEqual([4]);
    expect(await statutEtCorps(autreTechnicien)).toEqual({
      statut: 404,
      corps: { statusCode: 404, message: 'Indisponibilité introuvable pour ce technicien.' },
    });
  });

  it('US12 : refuse en 400 de supprimer une indisponibilité terminée, conservée dans l’historique', async () => {
    maintenant = new Date('2026-11-27T06:00:00.000Z');

    const reponse = await appeler('DELETE', `/technicians/${MARIE}/unavailabilities/2`);

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 400,
      corps: {
        statusCode: 400,
        message: 'Cette indisponibilité est terminée : elle est conservée dans l’historique.',
      },
    });
    expect(jeu.techniciens[MARIE - 1].indisponibilites.map(({ id }) => id)).toEqual([2, 4]);
  });
});

describe('GET /users simulé (US03, US11)', () => {
  const AUTHENTIFICATION_REQUISE = {
    statut: 401,
    corps: { statusCode: 401, message: 'Authentification requise.' },
  };

  /** Ouvre la session simulée et rend le jeton d'accès, comme la page de connexion le reçoit. */
  async function seConnecter(email: string): Promise<string> {
    const reponse = await appeler('POST', '/auth/login', { email, motDePasse: 'nimporte-quoi' });
    return ((await reponse.json()) as { accessToken: string }).accessToken;
  }

  function seConnecterEnAdministrateur(): Promise<string> {
    serveurApi.use(...creerHandlersAuthentification([ADMINISTRATEUR_DE_TEST], { urlApi }));
    return seConnecter(ADMINISTRATEUR_DE_TEST.email);
  }

  it('US11 : répond 403 « Accès refusé. » à un gestionnaire connecté, comme le guard du back', async () => {
    const jeton = await seConnecter(GESTIONNAIRE_DEMONSTRATION.email);

    const reponse = await appeler('GET', '/users?role=TECHNICIEN&actif=true', undefined, {
      jeton,
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 403,
      corps: { statusCode: 403, message: 'Accès refusé.' },
    });
  });

  it('US11 : répond 401 sans session', async () => {
    const reponse = await appeler('GET', '/users');

    expect(await statutEtCorps(reponse)).toEqual(AUTHENTIFICATION_REQUISE);
  });

  it('US11 : répond 401 à une requête sans jeton, même avec une session d’administrateur ouverte, avant le contrôle du rôle', async () => {
    await seConnecterEnAdministrateur();

    const sansJeton = await appeler('GET', '/users');
    const jetonInconnu = await appeler('GET', '/users', undefined, { jeton: 'jeton-invente' });

    expect(await statutEtCorps(sansJeton)).toEqual(AUTHENTIFICATION_REQUISE);
    expect(await statutEtCorps(jetonInconnu)).toEqual(AUTHENTIFICATION_REQUISE);
  });

  it('US03 : pour un administrateur, filtre par rôle et état, trie par nom et pagine', async () => {
    const jeton = await seConnecterEnAdministrateur();

    const techniciensActifs = await appeler(
      'GET',
      '/users?role=TECHNICIEN&actif=true&limit=4',
      undefined,
      { jeton },
    );
    const desactives = await appeler('GET', '/users?actif=false', undefined, { jeton });

    const liste = (await techniciensActifs.json()) as ListePaginee<CompteUtilisateur>;
    expect(nomsComplets(liste)).toEqual([
      'Rémi Dijoux',
      'Paul Lebon',
      'Sébastien Payet',
      'Jean Rivière',
    ]);
    expect(liste.meta).toEqual({ page: 1, limit: 4, total: 6, totalPages: 2 });
    expect(liste.data[0]).toEqual({
      id: 9,
      email: 'remi.dijoux@plumbly.demo',
      nom: 'Dijoux',
      prenom: 'Rémi',
      role: 'TECHNICIEN',
      actif: true,
      mdpAChanger: false,
      derniereConnexion: null,
      creeLe: '2026-01-05T04:00:00.000Z',
    });
    expect(nomsComplets(await desactives.json())).toEqual(['Fabrice Lebon']);
  });

  it('US03 : répond 400 avec les messages exacts à un rôle inconnu et à un état qui n’est pas booléen', async () => {
    const jeton = await seConnecterEnAdministrateur();

    const reponse = await appeler('GET', '/users?role=PLOMBIER&actif=oui', undefined, { jeton });

    expect((await reponse.json()).message).toEqual([
      'role doit valoir ADMIN ou GESTIONNAIRE ou TECHNICIEN',
      'actif doit valoir true ou false',
    ]);
  });
});
