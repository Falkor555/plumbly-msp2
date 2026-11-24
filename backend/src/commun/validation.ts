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
