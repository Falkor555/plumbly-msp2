import type { DateIso } from '../api/types';
import { ajouterJours, JOURS_OUVRES_PAR_SEMAINE, lundiDeLaSemaine } from '../commun/dates';

export type Vue = 'jour' | 'semaine';

const JOURS_PAR_SEMAINE = 7;
const DIMANCHE = 0;

function estDimanche(jour: DateIso): boolean {
  return new Date(`${jour}T00:00:00Z`).getUTCDay() === DIMANCHE;
}

/** Période demandée à l'API : la semaine ouvrée (lundi–samedi) ou le seul jour affiché. */
export function periodeAffichee(vue: Vue, jour: DateIso): { du: DateIso; au: DateIso } {
  if (vue === 'jour') return { du: jour, au: jour };
  const lundi = lundiDeLaSemaine(jour);
  return { du: lundi, au: ajouterJours(lundi, JOURS_OUVRES_PAR_SEMAINE - 1) };
}

/** Jour affiché après « précédent » (sens = -1) ou « suivant » (sens = 1). Le dimanche est sauté (RG11). */
export function deplacer(vue: Vue, jour: DateIso, sens: 1 | -1): DateIso {
  if (vue === 'semaine') return ajouterJours(jour, sens * JOURS_PAR_SEMAINE);
  const voisin = ajouterJours(jour, sens);
  return estDimanche(voisin) ? ajouterJours(voisin, sens) : voisin;
}
