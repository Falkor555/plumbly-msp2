import type { Champs } from '../commun/validation.js';

/*
 * Durée d'une intervention ou durée par défaut d'un type, en minutes (contrat d'API, 6.3 et 6.4) :
 * un quart d'heure au moins, une journée de 12 heures au plus (7 h – 19 h, RG11).
 */
export const DUREE_MINIMUM_MIN = 15;
export const DUREE_MAXIMUM_MIN = 720;

export function lireDuree(
  champs: Champs,
  nom: string,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): number | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) {
    return undefined;
  }
  if (
    !Number.isInteger(valeur) ||
    (valeur as number) < DUREE_MINIMUM_MIN ||
    (valeur as number) > DUREE_MAXIMUM_MIN
  ) {
    erreurs.push(
      `${nom} doit être un nombre entier de minutes entre ${DUREE_MINIMUM_MIN} et ${DUREE_MAXIMUM_MIN}`,
    );
    return undefined;
  }
  return valeur as number;
}
