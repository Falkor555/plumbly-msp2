import { BadRequestException } from '@nestjs/common';

const FORMAT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Les identifiants sont des colonnes integer (SERIAL) de PostgreSQL.
const IDENTIFIANT_MAXIMUM = 2_147_483_647;

/** Période en jours calendaires de La Réunion, bornes incluses (AAAA-MM-JJ). */
export interface PeriodeEnJours {
  du: string;
  au: string;
}

/*
 * Validations partagées par les modules (déplacées depuis le reporting, #21) : elles renvoient
 * une erreur 400 lisible avant tout accès à la base.
 */

export function validerDate(date: string): string {
  if (!estUneDate(date)) {
    throw new BadRequestException('Date invalide : format attendu AAAA-MM-JJ.');
  }
  return date;
}

/** Vrai pour un jour AAAA-MM-JJ qui existe dans le calendrier. */
export function estUneDate(date: string): boolean {
  const morceaux = FORMAT_DATE.exec(date);
  return morceaux !== null && estUnJourDuCalendrier(morceaux);
}

/** Rejette les dates bien formées mais inexistantes, comme le 30 février. */
function estUnJourDuCalendrier([, annee, mois, jour]: RegExpExecArray): boolean {
  const date = new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
  return (
    date.getUTCFullYear() === Number(annee) &&
    date.getUTCMonth() === Number(mois) - 1 &&
    date.getUTCDate() === Number(jour)
  );
}

export function validerPeriode({ du, au }: PeriodeEnJours): PeriodeEnJours {
  validerDate(du);
  validerDate(au);
  // Le format AAAA-MM-JJ se compare correctement dans l'ordre alphabétique.
  if (du > au) {
    throw new BadRequestException('Période invalide : la date de début suit la date de fin.');
  }
  return { du, au };
}

export function validerIdentifiant(identifiant: number): number {
  if (!Number.isInteger(identifiant) || identifiant < 1 || identifiant > IDENTIFIANT_MAXIMUM) {
    throw new BadRequestException('Identifiant invalide.');
  }
  return identifiant;
}

/**
 * Identifiant lu dans l'URL (paramètre de route ou de requête) : uniquement des chiffres.
 * Number() seul accepterait « 1e3 », « 0x1F » ou « 12 » entouré d'espaces.
 */
export function lireIdentifiant(texte: string): number {
  if (!/^\d{1,10}$/.test(texte)) {
    throw new BadRequestException('Identifiant invalide.');
  }
  return validerIdentifiant(Number(texte));
}

/*
 * Lecture des corps et des paramètres de requête, écrite à la main en attendant le
 * ValidationPipe et class-validator prévus par le contrat d'API (section 6) : mêmes règles,
 * même format d'erreur (400, message = liste des champs en erreur), champs inconnus refusés.
 * Chaque lecteur ajoute ses erreurs à la liste reçue, pour les renvoyer toutes en une fois.
 */

export type Champs = Record<string, unknown>;

const FORMAT_DATE_HEURE =
  /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
// Volontairement simple : la seule preuve qu'une adresse existe est un e-mail reçu.
const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMAT_TELEPHONE = /^0\d{9}$/;
const FORMAT_CODE_POSTAL = /^\d{5}$/;
const FORMAT_COULEUR = /^#[0-9A-F]{6}$/;
const LONGUEUR_EMAIL_MAXIMUM = 255;
// Au-delà, ce n'est plus un numéro saisi avec des espaces : inutile de le nettoyer.
const LONGUEUR_TELEPHONE_SAISI_MAXIMUM = 20;
const LONGUEUR_RECHERCHE_MINIMUM = 2;
const LONGUEUR_RECHERCHE_MAXIMUM = 100;
const ELEMENTS_PAR_PAGE_PAR_DEFAUT = 20;
const ELEMENTS_PAR_PAGE_MAXIMUM = 100;

/** Objet JSON dont tous les champs sont connus ; sinon 400 qui nomme les champs refusés. */
export function lireObjet(valeur: unknown, champsAutorises: readonly string[]): Champs {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
    throw new BadRequestException(['Le corps de la requête doit être un objet JSON']);
  }
  const inconnus = Object.keys(valeur).filter((cle) => !champsAutorises.includes(cle));
  if (inconnus.length > 0) {
    throw new BadRequestException(inconnus.map((cle) => `Le champ ${cle} n’est pas autorisé`));
  }
  return valeur as Champs;
}

export function signalerErreurs(erreurs: string[]): void {
  if (erreurs.length > 0) {
    throw new BadRequestException(erreurs);
  }
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
  if (valeur === undefined && !obligatoire) {
    return undefined;
  }
  if (!estUnIdentifiant(valeur)) {
    erreurs.push(`${nom} doit être un entier positif`);
    return undefined;
  }
  return valeur;
}

/**
 * Le fuseau est obligatoire (« Z » ou « +04:00 ») : une heure sans fuseau serait lue à l'heure
 * du serveur, et un même créneau pourrait être enregistré avec plusieurs heures de décalage.
 */
export function lireDateHeure(champs: Champs, nom: string, erreurs: string[]): Date | undefined {
  const valeur = champs[nom];
  const morceaux = typeof valeur === 'string' ? FORMAT_DATE_HEURE.exec(valeur) : null;
  const instant = morceaux === null ? Number.NaN : Date.parse(valeur as string);
  // Date.parse accepte le 30 février et le reporte au 2 mars : le jour est vérifié à part.
  if (morceaux === null || Number.isNaN(instant) || !estUneDate(morceaux[1])) {
    erreurs.push(
      `${nom} doit être une date-heure ISO 8601 avec fuseau, par exemple 2026-12-08T08:00:00+04:00`,
    );
    return undefined;
  }
  return new Date(instant);
}

export interface OptionsTexte {
  obligatoire: boolean;
  maximum: number;
  /** null est accepté et efface la valeur (champs facultatifs d'une modification). */
  effacable?: boolean;
}

/**
 * Texte débarrassé des espaces de début et de fin. Une chaîne vide est refusée plutôt que
 * d'effacer le champ en silence : pour effacer, le client envoie null.
 */
export function lireTexte(
  champs: Champs,
  nom: string,
  erreurs: string[],
  { obligatoire, maximum, effacable = false }: OptionsTexte,
): string | null | undefined {
  const valeur = champs[nom];
  if (valeur === undefined || (valeur === null && !effacable)) {
    if (obligatoire) {
      erreurs.push(`${nom} est obligatoire`);
    } else if (valeur === null) {
      erreurs.push(`${nom} ne peut pas être null`);
    }
    return undefined;
  }
  if (valeur === null) {
    return null;
  }
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

/** Valeur d'une énumération, par exemple typeClient. */
export function lireEnumeration<T extends string>(
  champs: Champs,
  nom: string,
  valeurs: readonly T[],
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): T | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) {
    return undefined;
  }
  if (!valeurs.includes(valeur as T)) {
    erreurs.push(`${nom} doit valoir ${valeurs.join(' ou ')}`);
    return undefined;
  }
  return valeur as T;
}

/**
 * Numéro français à 10 chiffres commençant par 0. Les espaces et les points de la saisie
 * sont retirés (« 06 92 12 34 56 » devient « 0692123456 ») ; tout autre séparateur est refusé.
 * Renvoie null si le numéro n'est pas valide.
 */
export function normaliserTelephone(saisie: string): string | null {
  if (saisie.length > LONGUEUR_TELEPHONE_SAISI_MAXIMUM) {
    return null;
  }
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
  if (valeur === undefined && !obligatoire) {
    return undefined;
  }
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
  if (valeur === undefined && !obligatoire) {
    return undefined;
  }
  const codePostal = typeof valeur === 'string' ? valeur.trim() : '';
  if (!FORMAT_CODE_POSTAL.test(codePostal)) {
    erreurs.push(`${nom} doit contenir 5 chiffres`);
    return undefined;
  }
  return codePostal;
}

/** Couleur #RRGGBB, renvoyée en majuscules pour comparer les couleurs entre elles. */
export function lireCouleur(
  champs: Champs,
  nom: string,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): string | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) {
    return undefined;
  }
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

/** Liste paginée du contrat d'API (section 4). */
export interface PageApi<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function paginer<T>(data: T[], total: number, { page, limit }: Pagination): PageApi<T> {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/** page et limit (section 4) : 20 éléments par défaut, 100 au maximum. */
export function lirePagination(requete: Champs, erreurs: string[]): Pagination {
  const page = lireEntierDeRequete(requete.page, 1);
  if (page === null) {
    erreurs.push('page doit être un entier positif');
  }
  const limit = lireEntierDeRequete(requete.limit, ELEMENTS_PAR_PAGE_PAR_DEFAUT);
  if (limit === null || limit > ELEMENTS_PAR_PAGE_MAXIMUM) {
    erreurs.push(`limit doit être un entier entre 1 et ${ELEMENTS_PAR_PAGE_MAXIMUM}`);
  }
  return { page: page ?? 1, limit: limit ?? ELEMENTS_PAR_PAGE_PAR_DEFAUT };
}

function lireEntierDeRequete(valeur: unknown, parDefaut: number): number | null {
  if (valeur === undefined) {
    return parDefaut;
  }
  if (typeof valeur !== 'string' || !/^\d{1,10}$/.test(valeur)) {
    return null;
  }
  const nombre = Number(valeur);
  return estUnIdentifiant(nombre) ? nombre : null;
}

/** « true » ou « false » ; absent : faux. */
export function lireBooleenDeRequete(requete: Champs, nom: string, erreurs: string[]): boolean {
  const valeur = requete[nom];
  if (valeur === undefined || valeur === 'false') {
    return false;
  }
  if (valeur === 'true') {
    return true;
  }
  erreurs.push(`${nom} doit valoir true ou false`);
  return false;
}

/** Recherche textuelle (section 4) : 2 caractères au moins une fois les espaces retirés. */
export function lireRecherche(requete: Champs, erreurs: string[]): string | undefined {
  const valeur = requete.recherche;
  if (valeur === undefined) {
    return undefined;
  }
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
  if (valeur === undefined) {
    return parDefaut;
  }
  if (!autorises.includes(valeur as T)) {
    erreurs.push(`tri doit valoir ${autorises.join(', ')}`);
    return parDefaut;
  }
  return valeur as T;
}
