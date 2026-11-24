/**
 * Fuseau métier : une « journée » de l'entreprise est une journée à La Réunion, alors que
 * les instants sont stockés en UTC (timestamptz) et que la session Prisma tourne en UTC.
 *
 * Les calculs passent par Intl plutôt que par un décalage fixe de 4 heures : le code reste
 * juste si le fuseau métier change un jour (RG11 parlait d'abord d'Europe/Paris, qui a une heure d'été).
 */
export const FUSEAU_METIER = 'Indian/Reunion';

const MINUTES_PAR_HEURE = 60;
const MILLISECONDES_PAR_MINUTE = 60_000;
const MILLISECONDES_PAR_JOUR = 86_400_000;

// en-CA écrit les dates au format AAAA-MM-JJ.
const formatJour = new Intl.DateTimeFormat('en-CA', {
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

const formatDecalage = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU_METIER,
  timeZoneName: 'longOffset',
});

/** Jour (AAAA-MM-JJ) à La Réunion de cet instant. */
export function jourMetier(instant: Date): string {
  return formatJour.format(instant);
}

/** Heure à La Réunion au format « 08:30 », pour les messages d'erreur. */
export function heureMetier(instant: Date): string {
  return formatHeure.format(instant);
}

/** Minutes écoulées depuis minuit à La Réunion (0 à 1 439). */
export function minutesDepuisMinuitMetier(instant: Date): number {
  const [heures, minutes] = heureMetier(instant).split(':').map(Number);
  return heures * MINUTES_PAR_HEURE + minutes;
}

/** Instant (UTC) de minuit à La Réunion le jour donné. */
export function debutDuJourMetier(jour: string): Date {
  const minuitUtc = Date.parse(`${jour}T00:00:00Z`);
  return new Date(minuitUtc - decalageEnMinutes(new Date(minuitUtc)) * MILLISECONDES_PAR_MINUTE);
}

/** Décalage du fuseau métier par rapport à UTC, en minutes (240 pour UTC+4). */
function decalageEnMinutes(instant: Date): number {
  const nomDuFuseau =
    formatDecalage.formatToParts(instant).find((partie) => partie.type === 'timeZoneName')?.value ??
    'GMT';
  const morceaux = /GMT([+-])(\d{2}):(\d{2})/.exec(nomDuFuseau);
  if (morceaux === null) {
    // Intl écrit « GMT » sans décalage quand le fuseau est à UTC+0.
    return 0;
  }
  const [, signe, heures, minutes] = morceaux;
  const decalage = Number(heures) * MINUTES_PAR_HEURE + Number(minutes);
  return signe === '-' ? -decalage : decalage;
}

/** Jour calendaire décalé de n jours (n peut être négatif). */
export function ajouterJours(jour: string, nombre: number): string {
  return new Date(Date.parse(`${jour}T00:00:00Z`) + nombre * MILLISECONDES_PAR_JOUR)
    .toISOString()
    .slice(0, 10);
}

/** Jour de la semaine d'un jour calendaire : 0 pour dimanche, 1 pour lundi… */
export function jourDeLaSemaine(jour: string): number {
  return new Date(`${jour}T00:00:00Z`).getUTCDay();
}

/** Valeur d'une colonne DATE pour Prisma (minuit UTC), et l'inverse. */
export function versColonneDate(jour: string): Date {
  return new Date(`${jour}T00:00:00Z`);
}

export function depuisColonneDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
