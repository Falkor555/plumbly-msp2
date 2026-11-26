import type {
  DateIso,
  Indisponibilite,
  NouvelleIndisponibilite,
  PeriodeIndisponibilites,
} from '../api/types';
import { dateHeureMetier, versInstant } from '../commun/dates';
import type { ErreursSaisie } from '../commun/saisie';

/*
 * Indisponibilités d'un technicien (US12, RG10). La validation reprend les règles de l'API
 * (backend/src/techniciens/techniciens.validation.ts) pour signaler chaque champ avant l'envoi :
 * c'est un confort, l'API reste seule juge et ses 400 et 409 s'affichent tels quels.
 */

/** Même borne que LONGUEUR_MOTIF dans techniciens.validation.ts : au-delà, l'API répond 400. */
export const LONGUEUR_MOTIF = 255;

/** Message exact de l'API pour une période à l'envers (lirePeriodeIndisponibilites). */
export const MESSAGE_PERIODE_INVERSEE = 'du doit précéder au';

/**
 * Borne haute (attribut max) des champs date : sans elle, un navigateur accepte une année à cinq
 * chiffres, que ni la validation ni l'API (AAAA-MM-JJ) ne reconnaissent.
 */
export const DERNIER_JOUR_SAISISSABLE: DateIso = '9999-12-31';

const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const FORMAT_HEURE = /^\d{2}:\d{2}$/;

/** Début et fin saisis en deux champs chacun (date et heure), à l'heure de La Réunion. */
export interface SaisieIndisponibilite {
  jourDebut: string;
  heureDebut: string;
  jourFin: string;
  heureFin: string;
  motif: string;
}

export const SAISIE_INDISPONIBILITE_VIDE: SaisieIndisponibilite = {
  jourDebut: '',
  heureDebut: '',
  jourFin: '',
  heureFin: '',
  motif: '',
};

export const MESSAGES_INDISPONIBILITE = {
  jourDebut: 'Saisissez la date de début.',
  heureDebut: 'Saisissez l’heure de début.',
  jourFin: 'Saisissez la date de fin.',
  heureFin: 'Saisissez l’heure de fin.',
  finAvantDebut: 'La fin doit être postérieure au début.',
} as const;

/** Bornes saisies dans le filtre « Période » de la liste, telles que les champs date les donnent. */
export interface SaisiePeriode {
  du: string;
  au: string;
}

export const SAISIE_PERIODE_VIDE: SaisiePeriode = { du: '', au: '' };

export function validerIndisponibilite(
  saisie: SaisieIndisponibilite,
): ErreursSaisie<SaisieIndisponibilite> {
  const erreurs: ErreursSaisie<SaisieIndisponibilite> = {};
  if (!FORMAT_JOUR.test(saisie.jourDebut)) erreurs.jourDebut = MESSAGES_INDISPONIBILITE.jourDebut;
  if (!FORMAT_HEURE.test(saisie.heureDebut)) {
    erreurs.heureDebut = MESSAGES_INDISPONIBILITE.heureDebut;
  }
  if (!FORMAT_JOUR.test(saisie.jourFin)) erreurs.jourFin = MESSAGES_INDISPONIBILITE.jourFin;
  if (!FORMAT_HEURE.test(saisie.heureFin)) erreurs.heureFin = MESSAGES_INDISPONIBILITE.heureFin;
  if (Object.keys(erreurs).length > 0) return erreurs;
  const debut = instantSaisi(saisie.jourDebut, saisie.heureDebut);
  const fin = instantSaisi(saisie.jourFin, saisie.heureFin);
  if (Number.isNaN(debut)) erreurs.jourDebut = MESSAGES_INDISPONIBILITE.jourDebut;
  if (Number.isNaN(fin)) erreurs.jourFin = MESSAGES_INDISPONIBILITE.jourFin;
  if (Object.keys(erreurs).length > 0 || fin > debut) return erreurs;
  // Le message va sur le champ fautif : la date quand les jours diffèrent, l'heure sinon.
  const champ = saisie.jourFin === saisie.jourDebut ? 'heureFin' : 'jourFin';
  erreurs[champ] = MESSAGES_INDISPONIBILITE.finAvantDebut;
  return erreurs;
}

/**
 * POST /technicians/:id/unavailabilities, une fois la saisie validée. Les instants partent en UTC
 * avec fuseau, depuis l'heure de La Réunion saisie (versInstant). Un motif vide est omis : l'API
 * l'enregistre alors à null.
 */
export function versNouvelleIndisponibilite(
  saisie: SaisieIndisponibilite,
): NouvelleIndisponibilite {
  const nouvelle: NouvelleIndisponibilite = {
    debut: versInstant(saisie.jourDebut, saisie.heureDebut),
    fin: versInstant(saisie.jourFin, saisie.heureFin),
  };
  const motif = saisie.motif.trim();
  if (motif !== '') nouvelle.motif = motif;
  return nouvelle;
}

/** Le message de l'API, avant tout appel, quand les deux bornes sont saisies à l'envers. */
export function verifierPeriode({ du, au }: SaisiePeriode): string | undefined {
  // Le format AAAA-MM-JJ se compare correctement dans l'ordre alphabétique.
  return du !== '' && au !== '' && du > au ? MESSAGE_PERIODE_INVERSEE : undefined;
}

/** Mêmes bornes : une saisie reposée à l'identique ne relit pas la liste. */
export function memesBornes(a: SaisiePeriode, b: SaisiePeriode): boolean {
  return a.du === b.du && a.au === b.au;
}

/** Seules les bornes renseignées partent : sans aucune, l'API renvoie ce qui est en cours ou à venir. */
export function versPeriode({ du, au }: SaisiePeriode): PeriodeIndisponibilites {
  const periode: PeriodeIndisponibilites = {};
  if (du !== '') periode.du = du as DateIso;
  if (au !== '') periode.au = au as DateIso;
  return periode;
}

/** Vrai dès que la fin est passée : l'API refuse alors la suppression (400), l'historique la garde. */
export function estTerminee(indisponibilite: Indisponibilite, maintenant: Date): boolean {
  return new Date(indisponibilite.fin).getTime() <= maintenant.getTime();
}

/** « du 27/11/2026 08:00 au 27/11/2026 12:00 », à l'heure de La Réunion. */
export function periodeLisible({ debut, fin }: Indisponibilite): string {
  return `du ${dateHeureMetier(debut)} au ${dateHeureMetier(fin)}`;
}

/**
 * Instant (ms) d'un jour et d'une heure saisis ; NaN quand la date n'existe pas (« 2026-13-01 »),
 * ce qu'un champ date ne produit pas mais que versInstant refuserait en levant.
 */
function instantSaisi(jour: string, heure: string): number {
  try {
    return new Date(versInstant(jour, heure)).getTime();
  } catch (erreur) {
    if (erreur instanceof RangeError) return Number.NaN;
    throw erreur;
  }
}
