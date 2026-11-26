import type { DateHeureIso, DateIso } from '../api/types';

/*
 * Toutes les dates affichées et tous les jours de planning sont ceux de La Réunion, quel que soit
 * le fuseau du navigateur : l'API stocke des instants UTC, la journée de travail est réunionnaise.
 */
export const FUSEAU_METIER = 'Indian/Reunion';

/*
 * La Réunion n'a pas d'heure d'été : son décalage est constant. Il sert uniquement à écrire
 * un instant à partir d'un jour et d'une heure saisis ; l'affichage passe par Intl.
 */
const DECALAGE_METIER = '+04:00';

/** RG11 : créneaux de 7 h à 19 h, du lundi au samedi. */
export const HEURE_OUVERTURE = 7;
export const HEURE_FERMETURE = 19;
export const JOURS_OUVRES_PAR_SEMAINE = 6;

const MS_PAR_JOUR = 86_400_000;

const formatJourIso = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU_METIER,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_METIER,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const formatDateCourte = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_METIER,
  day: '2-digit',
  month: '2-digit',
});

const formatDate = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU_METIER,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// Un jour AAAA-MM-JJ n'a pas d'heure : on le manipule comme un minuit UTC, formaté en UTC.
const formatJourCourt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
});

const formatJourLong = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function versMinuitUtc(jour: DateIso): Date {
  return new Date(`${jour}T00:00:00Z`);
}

/** Jour réunionnais d'un instant. */
export function jourMetier(instant: Date | DateHeureIso): DateIso {
  return formatJourIso.format(new Date(instant));
}

/** Heure réunionnaise d'un instant, par exemple « 08:30 ». */
export function heureMetier(instant: Date | DateHeureIso): string {
  return formatHeure.format(new Date(instant));
}

/** Date réunionnaise d'un instant, par exemple « 24/11 ». */
export function dateMetierCourte(instant: Date | DateHeureIso): string {
  return formatDateCourte.format(new Date(instant));
}

/** Date réunionnaise d'un instant, par exemple « 24/11/2026 ». */
export function dateMetier(instant: Date | DateHeureIso): string {
  return formatDate.format(new Date(instant));
}

/**
 * Date et heure réunionnaises d'un instant, par exemple « 24/11/2026 08:30 ». Assemblées à la main
 * parce que le séparateur d'Intl entre la date et l'heure varie selon le moteur (« , » ou « à »).
 */
export function dateHeureMetier(instant: Date | DateHeureIso): string {
  return `${dateMetier(instant)} ${heureMetier(instant)}`;
}

/** Minutes écoulées depuis minuit, heure de La Réunion. */
export function minutesDansLaJournee(instant: Date | DateHeureIso): number {
  const [heures, minutes] = heureMetier(instant).split(':').map(Number);
  return heures * 60 + minutes;
}

export function ajouterJours(jour: DateIso, nombre: number): DateIso {
  return new Date(versMinuitUtc(jour).getTime() + nombre * MS_PAR_JOUR).toISOString().slice(0, 10);
}

/** Lundi de la semaine qui contient ce jour (la semaine commence le lundi). */
export function lundiDeLaSemaine(jour: DateIso): DateIso {
  const rangDepuisLundi = (versMinuitUtc(jour).getUTCDay() + 6) % 7;
  return ajouterJours(jour, -rangDepuisLundi);
}

/** Les jours ouvrés (RG11) de la semaine qui commence ce lundi. */
export function joursOuvres(lundi: DateIso): DateIso[] {
  return Array.from({ length: JOURS_OUVRES_PAR_SEMAINE }, (_, rang) => ajouterJours(lundi, rang));
}

export function libelleJourCourt(jour: DateIso): string {
  return formatJourCourt.format(versMinuitUtc(jour));
}

/** « 23/11 » pour un jour AAAA-MM-JJ. */
export function libelleJourChiffres(jour: DateIso): string {
  const [, mois, quantieme] = jour.split('-');
  return `${quantieme}/${mois}`;
}

export function libelleJourLong(jour: DateIso): string {
  return formatJourLong.format(versMinuitUtc(jour));
}

/** Instant correspondant à un jour et une heure « HH:MM » saisis à La Réunion. */
export function versInstant(jour: DateIso, heure: string): DateHeureIso {
  return new Date(`${jour}T${heure}:00${DECALAGE_METIER}`).toISOString();
}

/** Vrai si la période [debut, fin) recouvre une partie de ce jour réunionnais. */
export function periodeTouche(jour: DateIso, debut: DateHeureIso, fin: DateHeureIso): boolean {
  const debutDuJour = new Date(versInstant(jour, '00:00')).getTime();
  const finDuJour = debutDuJour + MS_PAR_JOUR;
  return new Date(debut).getTime() < finDuJour && new Date(fin).getTime() > debutDuJour;
}
