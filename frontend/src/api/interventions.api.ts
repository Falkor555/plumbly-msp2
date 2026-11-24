import { api } from './clientHttp';
import type { Intervention, ListePaginee } from './types';

/** Le contrat plafonne une page à 100 éléments (docs/api.md, section 4). */
const TAILLE_PAGE_MAX = 100;

export const interventionsApi = {
  /**
   * Interventions en attente d'affectation, les plus urgentes d'abord (tri par défaut, RG18).
   * Route de l'issue #17 (Loïc) : tant qu'elle n'existe pas côté back-end, seuls les tests
   * et le mode simulé y répondent.
   */
  listerAPlanifier: (signal?: AbortSignal): Promise<ListePaginee<Intervention>> =>
    api.get<ListePaginee<Intervention>>('/interventions', {
      parametres: { statut: 'A_PLANIFIER', limit: TAILLE_PAGE_MAX },
      signal,
    }),
};
