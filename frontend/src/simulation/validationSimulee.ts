import { HttpResponse } from 'msw';
import type { ListePaginee } from '../api/types';

/*
 * Lecture des corps et des paramètres de requête par les faux serveurs, calquée sur
 * backend/src/commun/validation.ts : mêmes bornes, mêmes messages (apostrophe typographique
 * comprise), pour que les écrans voient en simulation les 400 qu'ils verront avec l'API. Les
 * contrôles propres à PostgreSQL (caractère NUL, demi-paire de substitution) ne sont pas repris.
 */

export type Champs = Record<string, unknown>;

const IDENTIFIANT_MAXIMUM = 2_147_483_647;
const FORMAT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMAT_DATE_HEURE =
  /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMAT_TELEPHONE = /^0\d{9}$/;
const FORMAT_CODE_POSTAL = /^\d{5}$/;
const FORMAT_COULEUR = /^#[0-9A-F]{6}$/;
const LONGUEUR_EMAIL_MAXIMUM = 255;
const LONGUEUR_TELEPHONE_SAISI_MAXIMUM = 20;
const LONGUEUR_RECHERCHE_MINIMUM = 2;
const LONGUEUR_RECHERCHE_MAXIMUM = 100;
const ELEMENTS_PAR_PAGE_PAR_DEFAUT = 20;
const ELEMENTS_PAR_PAGE_MAXIMUM = 100;

/** Réponse d'erreur au format de Nest : une chaîne pour une règle, un tableau en validation. */
export function erreur(statusCode: number, message: string | string[]): Response {
  return HttpResponse.json({ statusCode, message }, { status: statusCode });
}

/** Les lecteurs ci-dessous lèvent cette erreur, qui porte la réponse HTTP à renvoyer. */
export class RequeteRefusee extends Error {
  readonly reponse: Response;
  /**
   * Les messages de la réponse, lisibles sans la décoder : l'import (US31) rejoue la validation
   * de POST /clients sur chaque ligne et en fait les motifs de rejet de la ligne.
   */
  readonly messages: string[];

  constructor(reponse: Response, messages: string[]) {
    super('Requête refusée par la validation simulée');
    this.reponse = reponse;
    this.messages = messages;
  }
}

export function refuser(message: string | string[], statusCode = 400): RequeteRefusee {
  const messages = Array.isArray(message) ? message : [message];
  return new RequeteRefusee(erreur(statusCode, message), messages);
}

/** Exécute un handler ; une RequeteRefusee devient la réponse HTTP qu'elle porte. */
export async function repondre(travail: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await travail();
  } catch (echec) {
    if (echec instanceof RequeteRefusee) return echec.reponse;
    throw echec;
  }
}

/** Corps JSON de la requête ; un corps absent ou illisible compte comme « pas un objet ». */
export async function lireCorps(request: Request): Promise<unknown> {
  const texte = await request.text();
  if (texte === '') return undefined;
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    // Le vrai serveur répond 400 à un JSON mal formé : lireObjet s'en charge avec undefined.
    return undefined;
  }
}

/** lireObjet du back : objet JSON dont tous les champs sont connus, sinon 400 qui les nomme. */
export function lireObjet(valeur: unknown, champsAutorises: readonly string[]): Champs {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
    throw refuser(['Le corps de la requête doit être un objet JSON']);
  }
  const inconnus = Object.keys(valeur).filter((cle) => !champsAutorises.includes(cle));
  if (inconnus.length > 0) {
    throw refuser(inconnus.map((cle) => `Le champ ${cle} n’est pas autorisé`));
  }
  return valeur as Champs;
}

/**
 * Paramètres d'URL sous forme d'objet, puis même contrôle des clés que pour un corps. Comme le
 * lecteur « simple » d'Express 5 (node:querystring), une clé répétée devient un tableau : les
 * lecteurs ci-dessous, qui attendent du texte, la refusent alors en 400, comme l'API.
 */
export function lireParametres(request: Request, champsAutorises: readonly string[]): Champs {
  const parametres = new URL(request.url).searchParams;
  const champs: Champs = Object.fromEntries(
    [...new Set(parametres.keys())].map((cle) => {
      const valeurs = parametres.getAll(cle);
      return [cle, valeurs.length > 1 ? valeurs : valeurs[0]];
    }),
  );
  return lireObjet(champs, champsAutorises);
}

export function signalerErreurs(erreurs: string[]): void {
  if (erreurs.length > 0) throw refuser(erreurs);
}

/** Identifiant d'URL (paramètre de route MSW) : des chiffres, bornes d'un integer PostgreSQL. */
export function lireIdentifiant(texte: string | readonly string[] | undefined): number {
  if (typeof texte !== 'string' || !/^\d{1,10}$/.test(texte)) {
    throw refuser('Identifiant invalide.');
  }
  const identifiant = Number(texte);
  if (!estUnIdentifiant(identifiant)) throw refuser('Identifiant invalide.');
  return identifiant;
}

export function estUnIdentifiant(valeur: unknown): valeur is number {
  return (
    Number.isInteger(valeur) && (valeur as number) >= 1 && (valeur as number) <= IDENTIFIANT_MAXIMUM
  );
}

export function lireEntier(
  champs: Champs,
  nom: string,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): number | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) return undefined;
  if (!estUnIdentifiant(valeur)) {
    erreurs.push(`${nom} doit être un entier positif`);
    return undefined;
  }
  return valeur;
}

/** Vrai pour un jour AAAA-MM-JJ qui existe dans le calendrier (pas de 30 février). */
export function estUneDate(date: string): boolean {
  const morceaux = FORMAT_DATE.exec(date);
  if (morceaux === null) return false;
  const [, annee, mois, jour] = morceaux.map(Number);
  const candidate = new Date(Date.UTC(annee, mois - 1, jour));
  return (
    candidate.getUTCFullYear() === annee &&
    candidate.getUTCMonth() === mois - 1 &&
    candidate.getUTCDate() === jour
  );
}

/** Instant ISO 8601 avec fuseau obligatoire ; renvoyé normalisé (toISOString). */
export function lireDateHeure(champs: Champs, nom: string, erreurs: string[]): string | undefined {
  const valeur = champs[nom];
  const morceaux = typeof valeur === 'string' ? FORMAT_DATE_HEURE.exec(valeur) : null;
  const instant = morceaux === null ? Number.NaN : Date.parse(valeur as string);
  if (morceaux === null || Number.isNaN(instant) || !estUneDate(morceaux[1])) {
    erreurs.push(
      `${nom} doit être une date-heure ISO 8601 avec fuseau, par exemple 2026-12-08T08:00:00+04:00`,
    );
    return undefined;
  }
  return new Date(instant).toISOString();
}

export interface OptionsTexte {
  obligatoire: boolean;
  maximum: number;
  /** null est accepté et efface la valeur (champs facultatifs d'une modification). */
  effacable?: boolean;
}

/** Texte trimé ; une chaîne vide est refusée (pour effacer, le client envoie null). */
export function lireTexte(
  champs: Champs,
  nom: string,
  erreurs: string[],
  { obligatoire, maximum, effacable = false }: OptionsTexte,
): string | null | undefined {
  const valeur = champs[nom];
  if (valeur === undefined || (valeur === null && !effacable)) {
    if (obligatoire) erreurs.push(`${nom} est obligatoire`);
    else if (valeur === null) erreurs.push(`${nom} ne peut pas être null`);
    return undefined;
  }
  if (valeur === null) return null;
  if (typeof valeur !== 'string') {
    erreurs.push(`${nom} doit être un texte`);
    return undefined;
  }
  const texte = valeur.trim();
  if (texte === '') {
    erreurs.push(`${nom} ne peut pas être vide`);
    return undefined;
  }
  if (texte.length > maximum) {
    erreurs.push(`${nom} ne doit pas dépasser ${maximum} caractères`);
    return undefined;
  }
  return texte;
}

export function lireEnumeration<T extends string>(
  champs: Champs,
  nom: string,
  valeurs: readonly T[],
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): T | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) return undefined;
  if (!valeurs.includes(valeur as T)) {
    erreurs.push(`${nom} doit valoir ${valeurs.join(' ou ')}`);
    return undefined;
  }
  return valeur as T;
}

/** Numéro à 10 chiffres sans ses espaces ni ses points, ou null s'il n'est pas valide. */
export function normaliserTelephone(saisie: string): string | null {
  if (saisie.length > LONGUEUR_TELEPHONE_SAISI_MAXIMUM) return null;
  const chiffres = saisie.replace(/[ .]/g, '');
  return FORMAT_TELEPHONE.test(chiffres) ? chiffres : null;
}

export function lireTelephone(
  champs: Champs,
  nom: string,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): string | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) return undefined;
  const telephone = typeof valeur === 'string' ? normaliserTelephone(valeur) : null;
  if (telephone === null) {
    erreurs.push(`${nom} doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)`);
    return undefined;
  }
  return telephone;
}

export function lireEmail(
  champs: Champs,
  nom: string,
  erreurs: string[],
  options: Omit<OptionsTexte, 'maximum'>,
): string | null | undefined {
  const nombreDErreurs = erreurs.length;
  const email = lireTexte(champs, nom, erreurs, { ...options, maximum: LONGUEUR_EMAIL_MAXIMUM });
  if (typeof email === 'string' && !FORMAT_EMAIL.test(email)) {
    erreurs.push(`${nom} doit être une adresse e-mail valide`);
    return undefined;
  }
  return erreurs.length > nombreDErreurs ? undefined : email;
}

export function lireCodePostal(
  champs: Champs,
  nom: string,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): string | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) return undefined;
  const codePostal = typeof valeur === 'string' ? valeur.trim() : '';
  if (!FORMAT_CODE_POSTAL.test(codePostal)) {
    erreurs.push(`${nom} doit contenir 5 chiffres`);
    return undefined;
  }
  return codePostal;
}

/** Couleur #RRGGBB, renvoyée en majuscules comme l'API l'enregistre. */
export function lireCouleur(
  champs: Champs,
  nom: string,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): string | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) return undefined;
  const couleur = typeof valeur === 'string' ? valeur.toUpperCase() : '';
  if (!FORMAT_COULEUR.test(couleur)) {
    erreurs.push(`${nom} doit être une couleur au format #RRGGBB`);
    return undefined;
  }
  return couleur;
}

// ---------- Paramètres de requête (toujours du texte) ----------

export interface Pagination {
  page: number;
  limit: number;
}

/** page et limit (contrat, section 4) : 20 éléments par défaut, 100 au maximum. */
export function lirePagination(requete: Champs, erreurs: string[]): Pagination {
  const page = lireEntierDeRequete(requete.page, 1);
  if (page === null) erreurs.push('page doit être un entier positif');
  const limit = lireEntierDeRequete(requete.limit, ELEMENTS_PAR_PAGE_PAR_DEFAUT);
  if (limit === null || limit > ELEMENTS_PAR_PAGE_MAXIMUM) {
    erreurs.push(`limit doit être un entier entre 1 et ${ELEMENTS_PAR_PAGE_MAXIMUM}`);
  }
  return { page: page ?? 1, limit: limit ?? ELEMENTS_PAR_PAGE_PAR_DEFAUT };
}

function lireEntierDeRequete(valeur: unknown, parDefaut: number): number | null {
  if (valeur === undefined) return parDefaut;
  if (typeof valeur !== 'string' || !/^\d{1,10}$/.test(valeur)) return null;
  const nombre = Number(valeur);
  return estUnIdentifiant(nombre) ? nombre : null;
}

/** La page demandée d'une liste déjà filtrée et triée, avec les métadonnées du contrat. */
export function paginer<T>(elements: T[], { page, limit }: Pagination): ListePaginee<T> {
  return {
    data: elements.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total: elements.length, totalPages: Math.ceil(elements.length / limit) },
  };
}

/** « true » ou « false » ; absent : faux. */
export function lireBooleenDeRequete(requete: Champs, nom: string, erreurs: string[]): boolean {
  const valeur = requete[nom];
  if (valeur === undefined || valeur === 'false') return false;
  if (valeur === 'true') return true;
  erreurs.push(`${nom} doit valoir true ou false`);
  return false;
}

/** Recherche textuelle (section 4) : 2 caractères au moins une fois les espaces retirés. */
export function lireRecherche(requete: Champs, erreurs: string[]): string | undefined {
  const valeur = requete.recherche;
  if (valeur === undefined) return undefined;
  const recherche = typeof valeur === 'string' ? valeur.trim() : '';
  if (recherche.length < LONGUEUR_RECHERCHE_MINIMUM) {
    erreurs.push(`recherche doit contenir au moins ${LONGUEUR_RECHERCHE_MINIMUM} caractères`);
    return undefined;
  }
  if (recherche.length > LONGUEUR_RECHERCHE_MAXIMUM) {
    erreurs.push(`recherche ne doit pas dépasser ${LONGUEUR_RECHERCHE_MAXIMUM} caractères`);
    return undefined;
  }
  return recherche;
}

/** Tri parmi une liste fermée (« nom » croissant, « -nom » décroissant). */
export function lireTri<T extends string>(
  requete: Champs,
  autorises: readonly T[],
  parDefaut: T,
  erreurs: string[],
): T {
  const valeur = requete.tri;
  if (valeur === undefined) return parDefaut;
  if (!autorises.includes(valeur as T)) {
    erreurs.push(`tri doit valoir ${autorises.join(', ')}`);
    return parDefaut;
  }
  return valeur as T;
}

// ---------- Recherche et tri sans accents, comme unaccent + lower en SQL ----------

export function sansAccent(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function contientSansAccent(texte: string | null, recherche: string): boolean {
  return texte !== null && sansAccent(texte).includes(sansAccent(recherche));
}

export function comparerSansAccent(premier: string, second: string): number {
  return sansAccent(premier).localeCompare(sansAccent(second), 'fr');
}

/**
 * Identifiants suivants, comme une séquence PostgreSQL : ils continuent après le plus grand
 * identifiant du jeu et ne sont jamais réutilisés, même après une suppression.
 */
export function compteurApres(identifiants: number[]): () => number {
  let dernier = Math.max(0, ...identifiants);
  return () => ++dernier;
}

/** Retire les clés non envoyées : la mise à jour ne touche que les champs présents. */
export function sansChampsAbsents<T extends object>(objet: T): T {
  return Object.fromEntries(
    Object.entries(objet).filter(([, valeur]) => valeur !== undefined),
  ) as T;
}
