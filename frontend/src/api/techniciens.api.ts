import { api } from './clientHttp';
import { parametresDeCriteresTechniciens, parametresDePagination } from './parametres';
import type {
  FicheTechnicien,
  FiltresTechniciens,
  Indisponibilite,
  ListePaginee,
  ModificationTechnicien,
  NouveauTechnicien,
  NouvelleIndisponibilite,
  PeriodeIndisponibilites,
} from './types';

export const techniciensApi = {
  /** US11 : la recherche porte sur le nom et le prénom du compte. */
  lister: (
    filtres: FiltresTechniciens,
    signal?: AbortSignal,
  ): Promise<ListePaginee<FicheTechnicien>> =>
    api.get<ListePaginee<FicheTechnicien>>('/technicians', {
      parametres: {
        ...parametresDeCriteresTechniciens(filtres),
        ...parametresDePagination(filtres),
      },
      signal,
    }),

  /** US11 : 400 si le compte n'est pas un compte TECHNICIEN actif, 409 s'il a déjà une fiche. */
  creer: (technicien: NouveauTechnicien): Promise<FicheTechnicien> =>
    api.post<FicheTechnicien>('/technicians', technicien),

  consulter: (id: number, signal?: AbortSignal): Promise<FicheTechnicien> =>
    api.get<FicheTechnicien>(`/technicians/${id}`, { signal }),

  /** Téléphone et couleur seulement : nom, prénom et e-mail appartiennent au compte. */
  modifier: (id: number, modification: ModificationTechnicien): Promise<FicheTechnicien> =>
    api.patch<FicheTechnicien>(`/technicians/${id}`, modification),

  /** Définitif ; 409 tant qu'il a des interventions en cours ou planifiées à venir. */
  archiver: (id: number): Promise<FicheTechnicien> =>
    api.post<FicheTechnicien>(`/technicians/${id}/archive`),

  /** US12 : sans période, les indisponibilités en cours et à venir, de la plus proche à la plus lointaine. */
  listerIndisponibilites: (
    id: number,
    periode: PeriodeIndisponibilites = {},
    signal?: AbortSignal,
  ): Promise<Indisponibilite[]> =>
    api.get<Indisponibilite[]>(`/technicians/${id}/unavailabilities`, {
      parametres: { du: periode.du, au: periode.au },
      signal,
    }),

  /** US12 : 409 si la période recouvre une intervention ou une autre indisponibilité. */
  ajouterIndisponibilite: (
    id: number,
    indisponibilite: NouvelleIndisponibilite,
  ): Promise<Indisponibilite> =>
    api.post<Indisponibilite>(`/technicians/${id}/unavailabilities`, indisponibilite),

  /** US12 : 204 sans corps ; 400 si l'indisponibilité est déjà terminée. */
  supprimerIndisponibilite: (id: number, idIndisponibilite: number): Promise<void> =>
    api.delete<void>(`/technicians/${id}/unavailabilities/${idIndisponibilite}`),
};
