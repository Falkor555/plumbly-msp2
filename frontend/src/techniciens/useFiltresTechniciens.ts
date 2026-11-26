import type { TriTechniciens } from '../api/types';
import { type FiltresDeListe, useFiltresDeListe } from '../commun/useFiltresDeListe';

/** 20 éléments par page, la valeur par défaut de l'API (cahier des charges §6.4). */
export const TAILLE_PAGE_TECHNICIENS = 20;

/** Critères choisis dans le menu et la case, appliqués dès leur changement. */
export interface CriteresChoisisTechniciens {
  archives: boolean;
  tri: TriTechniciens;
}

export type FiltresDesTechniciens = FiltresDeListe<CriteresChoisisTechniciens>;

const CRITERES_INITIAUX: CriteresChoisisTechniciens = { archives: false, tri: 'nom' };

/** Filtres de la liste des techniciens (US11) : recherche à la frappe, archivés et tri. */
export function useFiltresTechniciens(): FiltresDesTechniciens {
  return useFiltresDeListe(CRITERES_INITIAUX);
}
