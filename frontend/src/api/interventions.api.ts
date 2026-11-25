import { api } from './clientHttp';
import type { FinDIntervention, Intervention, ListePaginee, SignatureIntervention } from './types';

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

  /** US17 : planifiée → en cours, le jour de la tournée (RG24, sinon 400). */
  demarrer: (id: number): Promise<Intervention> =>
    api.post<Intervention>(`/interventions/${id}/start`),

  /** US17, US18 et US33 : en cours → terminée, avec la signature du client si elle est donnée. */
  terminer: (id: number, fin: FinDIntervention): Promise<Intervention> =>
    api.post<Intervention>(`/interventions/${id}/complete`, fin),

  /** US18 : remplace le compte rendu d'une intervention terminée et non signée (RG33). */
  completerCompteRendu: (id: number, compteRendu: string): Promise<Intervention> =>
    api.patch<Intervention>(`/interventions/${id}/report`, { compteRendu }),

  /** US33 : 404 si l'intervention n'a pas été signée. */
  lireSignature: (id: number, signal?: AbortSignal): Promise<SignatureIntervention> =>
    api.get<SignatureIntervention>(`/interventions/${id}/signature`, { signal }),
};
