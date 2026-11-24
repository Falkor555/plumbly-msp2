import { api } from './clientHttp';
import type { Affectation, FiltresPlanning, NouvelleTournee, Planning, Tournee } from './types';

export const tourneesApi = {
  /** US23 : planning d'une période (du = au pour un jour). */
  consulterPlanning: (filtres: FiltresPlanning, signal?: AbortSignal): Promise<Planning> =>
    api.get<Planning>('/tours', { parametres: { ...filtres }, signal }),

  /**
   * US24 : tournée du technicien connecté, déduit du jeton et jamais d'un paramètre.
   * L'API répond 204 sans corps quand il n'a pas de tournée aujourd'hui : on renvoie alors null.
   */
  consulterMaTourneeDuJour: async (signal?: AbortSignal): Promise<Tournee | null> =>
    (await api.get<Tournee | undefined>('/tours/me/today', { signal })) ?? null,

  /** US20 : 409 si le technicien a déjà une tournée ce jour-là. */
  creer: (tournee: NouvelleTournee): Promise<Tournee> => api.post<Tournee>('/tours', tournee),

  /** US21 : 409 en cas de chevauchement ou d'indisponibilité, 400 hors des horaires (RG11). */
  affecterIntervention: (tourneeId: number, affectation: Affectation): Promise<Tournee> =>
    api.post<Tournee>(`/tours/${tourneeId}/interventions`, affectation),
};
