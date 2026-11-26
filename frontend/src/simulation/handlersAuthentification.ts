import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Profil } from '../api/auth.api';
import { COMPTES_CREES_LE } from './comptesDemonstration';

/*
 * Simulation des routes d'authentification (docs/api.md, 5.1 et 6.1 ; back :
 * backend/src/authentification/) pour parcourir les écrans sans API. Les codes et les messages
 * (400 de lecture du corps, 401) sont ceux du back ; les règles de sécurité (argon2, rotation du
 * jeton, 429) ne sont pas reprises : ce faux serveur ne tourne qu'en développement et n'entre pas
 * dans le bundle de production.
 *
 * Aucun mot de passe de démonstration n'existe : pour un e-mail connu, tout mot de passe NON VIDE
 * est accepté. Il n'y a donc rien à retenir, et surtout rien de secret dans le dépôt.
 */

const JETON_DE_DEMONSTRATION = 'jeton-de-demonstration';
/** DUREE_JETON_ACCES_SECONDES du back. */
const EXPIRATION_SECONDES = 900;

/*
 * La session simulée est l'e-mail du compte connecté. Il est gardé en mémoire et recopié dans
 * sessionStorage pour survivre à un rechargement de la page (F5), comme le fait le cookie httpOnly
 * du vrai serveur. C'est acceptable ici parce que ce stockage joue le rôle du SERVEUR de
 * développement, pas celui de l'application : il ne contient aucun jeton ni secret (un e-mail de
 * démonstration), et le code de l'application n'y touche jamais. La règle « jeton d'accès en
 * mémoire seulement » (ADR 0007, CLAUDE.md) porte sur le vrai jeton, qui reste dans jetonAcces.ts.
 */
const CLE_SESSION = 'plumbly-simulation.compte';

// Messages exacts du back.
const IDENTIFIANTS_INCORRECTS = 'E-mail ou mot de passe incorrect.';
const SESSION_INVALIDE = 'Session expirée : se reconnecter.';
const AUTHENTIFICATION_REQUISE = 'Authentification requise.';

let comptesConnus: readonly Profil[] = [];
let emailEnMemoire: string | null = null;

function stockage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch (erreur) {
    // Stockage refusé par le navigateur (vie privée) : la session ne survivra pas à un F5.
    console.warn(
      '[Plumbly] sessionStorage indisponible, la session simulée reste en mémoire.',
      erreur,
    );
    return null;
  }
}

function emailDeLaSession(): string | null {
  return emailEnMemoire ?? stockage()?.getItem(CLE_SESSION) ?? null;
}

function ouvrirSession(email: string): void {
  emailEnMemoire = email;
  stockage()?.setItem(CLE_SESSION, email);
}

function fermerSession(): void {
  emailEnMemoire = null;
  stockage()?.removeItem(CLE_SESSION);
}

/**
 * Compte connecté du mode simulé, ou null. Les autres handlers (planning, interventions) s'en
 * serviront pour répondre selon le rôle ; une nouvelle instance des handlers retrouve la session
 * ouverte avant un rechargement de la page.
 */
export function compteConnecte(): Profil | null {
  const email = emailDeLaSession();
  return comptesConnus.find((compte) => compte.email === email) ?? null;
}

function erreur(statusCode: number, message: string | string[]) {
  return HttpResponse.json({ statusCode, message }, { status: statusCode });
}

function porteLeJeton(request: Request): boolean {
  return request.headers.get('Authorization') === `Bearer ${JETON_DE_DEMONSTRATION}`;
}

/**
 * Compte à l'origine de la requête, comme le garde d'authentification du back : il faut le jeton
 * de démonstration ET une session ouverte. Sinon null, et la route protégée répond 401.
 */
export function compteAuthentifie(request: Request): Profil | null {
  return porteLeJeton(request) ? compteConnecte() : null;
}

/** Objet Utilisateur du contrat (6.2), tel que GET /users/me le renvoie. */
function versUtilisateurApi(profil: Profil) {
  return {
    ...profil,
    actif: true,
    derniereConnexion: new Date().toISOString(),
    creeLe: COMPTES_CREES_LE,
  };
}

// Mêmes bornes et même format que backend/src/commun/validation.ts et authentification.validation.ts.
const CHAMPS_CONNEXION = ['email', 'motDePasse'];
const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGUEUR_EMAIL_MAXIMUM = 255;
const LONGUEUR_MOT_DE_PASSE_SAISI_MAXIMUM = 1_024;

/**
 * Lecture du corps de POST /auth/login : mêmes 400 et mêmes messages que lireConnexion du back
 * (lireObjet, lireEmail, lireMotDePasseSaisi), hors les caractères interdits par PostgreSQL
 * (NUL, demi-paire de substitution) qu'un faux serveur sans base n'a pas à reproduire.
 */
async function lireIdentifiants(
  request: Request,
): Promise<{ email: string; motDePasse: string } | Response> {
  const corps: unknown = await request.json().catch(() => null);
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    return erreur(400, ['Le corps de la requête doit être un objet JSON']);
  }
  const inconnus = Object.keys(corps).filter((cle) => !CHAMPS_CONNEXION.includes(cle));
  if (inconnus.length > 0) {
    return erreur(
      400,
      inconnus.map((cle) => `Le champ ${cle} n’est pas autorisé`),
    );
  }
  const champs = corps as Record<string, unknown>;
  const erreurs: string[] = [];
  const email = lireEmail(champs.email, erreurs);
  const motDePasse = lireMotDePasseSaisi(champs.motDePasse, erreurs);
  if (erreurs.length > 0) return erreur(400, erreurs);
  // Le back enregistre et compare les e-mails en minuscules.
  return { email: (email as string).toLowerCase(), motDePasse: motDePasse as string };
}

/** lireEmail du back : texte trimé, non vide, borné, puis format. */
function lireEmail(valeur: unknown, erreurs: string[]): string | undefined {
  if (valeur === undefined || valeur === null) {
    erreurs.push('email est obligatoire');
    return undefined;
  }
  if (typeof valeur !== 'string') {
    erreurs.push('email doit être un texte');
    return undefined;
  }
  const email = valeur.trim();
  if (email === '') {
    erreurs.push('email ne peut pas être vide');
  } else if (email.length > LONGUEUR_EMAIL_MAXIMUM) {
    erreurs.push(`email ne doit pas dépasser ${LONGUEUR_EMAIL_MAXIMUM} caractères`);
  } else if (!FORMAT_EMAIL.test(email)) {
    erreurs.push('email doit être une adresse e-mail valide');
  } else {
    return email;
  }
  return undefined;
}

/** lireMotDePasseSaisi du back : tel que saisi (les espaces font partie du mot de passe). */
function lireMotDePasseSaisi(valeur: unknown, erreurs: string[]): string | undefined {
  if (typeof valeur !== 'string' || valeur === '') {
    erreurs.push('motDePasse est obligatoire');
    return undefined;
  }
  if (valeur.length > LONGUEUR_MOT_DE_PASSE_SAISI_MAXIMUM) {
    erreurs.push('motDePasse est trop long');
    return undefined;
  }
  return valeur;
}

export function creerHandlersAuthentification(
  comptes: readonly Profil[],
  options: { urlApi: (chemin: string) => string },
): HttpHandler[] {
  const { urlApi } = options;
  comptesConnus = comptes;
  // Une nouvelle instance (rechargement de la page) repart du stockage, pas d'une ancienne mémoire.
  emailEnMemoire = null;

  return [
    http.post(urlApi('/auth/login'), async ({ request }) => {
      const identifiants = await lireIdentifiants(request);
      if (identifiants instanceof Response) return identifiants;
      const compte = comptes.find(({ email }) => email === identifiants.email);
      // Le mot de passe n'est pas vérifié (voir l'en-tête du fichier) : il est seulement non vide.
      if (!compte) return erreur(401, IDENTIFIANTS_INCORRECTS);
      ouvrirSession(compte.email);
      return HttpResponse.json({
        accessToken: JETON_DE_DEMONSTRATION,
        expiresIn: EXPIRATION_SECONDES,
        utilisateur: compte,
      });
    }),

    http.post(urlApi('/auth/refresh'), () => {
      if (!compteConnecte()) return erreur(401, SESSION_INVALIDE);
      return HttpResponse.json({
        accessToken: JETON_DE_DEMONSTRATION,
        expiresIn: EXPIRATION_SECONDES,
      });
    }),

    http.get(urlApi('/users/me'), ({ request }) => {
      const compte = compteAuthentifie(request);
      if (!compte) return erreur(401, AUTHENTIFICATION_REQUISE);
      return HttpResponse.json(versUtilisateurApi(compte));
    }),

    http.post(urlApi('/auth/logout'), ({ request }) => {
      // Comme le back : la route est protégée, un appel sans jeton est refusé avant tout.
      if (!porteLeJeton(request)) return erreur(401, AUTHENTIFICATION_REQUISE);
      fermerSession();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
