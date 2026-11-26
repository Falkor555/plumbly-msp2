import { api } from './clientHttp';
import type {
  DateIso,
  FinDIntervention,
  Intervention,
  ListePaginee,
  ModificationIntervention,
  NouvelleIntervention,
  SignatureIntervention,
  StatutIntervention,
  Urgence,
} from './types';

/** Le contrat plafonne une page à 100 éléments (docs/api.md, section 4). */
const TAILLE_PAGE_MAX = 100;

/** Taille d'une page de la liste du bureau : la valeur par défaut du contrat. */
const TAILLE_PAGE = 20;

/** Filtres de GET /interventions (US15), tous facultatifs et combinables. */
export interface FiltresInterventions {
  recherche?: string;
  statut?: StatutIntervention;
  urgence?: Urgence;
  du?: DateIso;
  au?: DateIso;
  page: number;
}

export const interventionsApi = {
  /** US15 : liste filtrée et paginée, les plus urgentes d'abord (tri par défaut, RG18). */
  lister: (
    filtres: FiltresInterventions,
    signal?: AbortSignal,
  ): Promise<ListePaginee<Intervention>> =>
    api.get<ListePaginee<Intervention>>('/interventions', {
      parametres: { ...filtres, limit: TAILLE_PAGE },
      signal,
    }),

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

  /** US14 : la nouvelle intervention est créée « à planifier » (RG01). */
  creer: (intervention: NouvelleIntervention): Promise<Intervention> =>
    api.post<Intervention>('/interventions', intervention),

  /** US16 : 400 si elle n'est plus modifiable (RG06, RG15), 409 si la durée chevauche (RG09). */
  modifier: (id: number, modification: ModificationIntervention): Promise<Intervention> =>
    api.patch<Intervention>(`/interventions/${id}`, modification),

  /** US16 : motif obligatoire ; l'intervention quitte sa tournée si elle en avait une (RG05). */
  annuler: (id: number, motif: string): Promise<Intervention> =>
    api.post<Intervention>(`/interventions/${id}/cancel`, { motif }),

  /** US14 et US24 : une intervention, par exemple pour relire son statut après une réponse perdue. */
  consulter: (id: number, signal?: AbortSignal): Promise<Intervention> =>
    api.get<Intervention>(`/interventions/${id}`, { signal }),

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
