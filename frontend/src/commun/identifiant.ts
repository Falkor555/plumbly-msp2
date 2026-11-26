/*
 * Mêmes bornes que l'API (lireIdentifiant, backend/src/commun/validation.ts) : un entier écrit en
 * chiffres, sans zéro de tête, qui tient dans un entier PostgreSQL. Une adresse hors de ces bornes
 * ne peut désigner aucune fiche : on l'écarte avant tout appel plutôt que d'afficher le 400 de l'API.
 */
const FORME_IDENTIFIANT = /^[1-9]\d*$/;
const IDENTIFIANT_MAXIMUM = 2_147_483_647;

/** Identifiant lu dans un segment d'URL, ou null s'il ne peut désigner aucune fiche. */
export function lireIdentifiant(segment: string): number | null {
  if (!FORME_IDENTIFIANT.test(segment)) return null;
  const identifiant = Number(segment);
  return identifiant <= IDENTIFIANT_MAXIMUM ? identifiant : null;
}
