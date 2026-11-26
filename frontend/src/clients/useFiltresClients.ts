import type { TriClients, TypeClient } from '../api/types';
import { type FiltresDeListe, useFiltresDeListe } from '../commun/useFiltresDeListe';

/** 20 éléments par page, la valeur par défaut de l'API (cahier des charges §6.4). */
export const TAILLE_PAGE_CLIENTS = 20;

/** Critères choisis dans les menus et la case, appliqués dès leur changement. */
export interface CriteresChoisis {
  typeClient?: TypeClient;
  archives: boolean;
  tri: TriClients;
}

/** Ses critères appliqués sont partagés par la liste et l'export (US32). */
export type FiltresDeLaListe = FiltresDeListe<CriteresChoisis>;

const CRITERES_INITIAUX: CriteresChoisis = { archives: false, tri: 'nomAffiche' };

/** Filtres de la liste des clients (US08) : recherche à la frappe, type, archivés et tri. */
export function useFiltresClients(): FiltresDeLaListe {
  return useFiltresDeListe(CRITERES_INITIAUX);
}
