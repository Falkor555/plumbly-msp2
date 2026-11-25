import { jourMetier } from '../commun/dates';
import { api, telecharger } from './clientHttp';
import {
  parametreDeStatuts,
  parametresDeCriteresClients,
  parametresDePagination,
} from './parametres';
import type {
  Adresse,
  Client,
  CriteresClients,
  DemandeAnalyse,
  DemandeImport,
  FiltresClients,
  FiltresHistorique,
  Intervention,
  ListePaginee,
  ModificationAdresse,
  ModificationClient,
  NouveauClient,
  NouvelleAdresse,
  RapportImport,
  ReponseAnalyse,
} from './types';

/** Même nom que celui que donne l'API (nomDuFichierCsv), au cas où l'en-tête serait illisible. */
export function nomDuFichierExport(instant: Date): string {
  return `clients-${jourMetier(instant)}.csv`;
}

export const clientsApi = {
  /** US08 : liste filtrée, triée et paginée. */
  lister: (filtres: FiltresClients, signal?: AbortSignal): Promise<ListePaginee<Client>> =>
    api.get<ListePaginee<Client>>('/clients', {
      parametres: { ...parametresDeCriteresClients(filtres), ...parametresDePagination(filtres) },
      signal,
    }),

  /** US06 : le client et sa première adresse (RG21). */
  creer: (client: NouveauClient): Promise<Client> => api.post<Client>('/clients', client),

  /** Toutes les adresses, archivées comprises ; un client archivé reste consultable. */
  consulter: (id: number, signal?: AbortSignal): Promise<Client> =>
    api.get<Client>(`/clients/${id}`, { signal }),

  /** US10 : 400 si le client est archivé. */
  modifier: (id: number, modification: ModificationClient): Promise<Client> =>
    api.patch<Client>(`/clients/${id}`, modification),

  /** US10 et RG22 : définitif ; 409 tant qu'il a des interventions actives. */
  archiver: (id: number): Promise<Client> => api.post<Client>(`/clients/${id}/archive`),

  /** US09 : interventions du client, de la plus récemment créée à la plus ancienne. */
  historique: (
    id: number,
    filtres: FiltresHistorique,
    signal?: AbortSignal,
  ): Promise<ListePaginee<Intervention>> =>
    api.get<ListePaginee<Intervention>>(`/clients/${id}/interventions`, {
      parametres: {
        ...parametresDePagination(filtres),
        statut: parametreDeStatuts(filtres.statuts),
      },
      signal,
    }),

  /** US07 : 400 si le client est archivé. */
  ajouterAdresse: (id: number, adresse: NouvelleAdresse): Promise<Adresse> =>
    api.post<Adresse>(`/clients/${id}/addresses`, adresse),

  /** US07 : 400 si le client ou l'adresse est archivé. */
  modifierAdresse: (
    id: number,
    idAdresse: number,
    modification: ModificationAdresse,
  ): Promise<Adresse> => api.patch<Adresse>(`/clients/${id}/addresses/${idAdresse}`, modification),

  /** US07 et RG21 : 400 sur la dernière adresse active, 409 avec des interventions actives. */
  archiverAdresse: (id: number, idAdresse: number): Promise<Adresse> =>
    api.post<Adresse>(`/clients/${id}/addresses/${idAdresse}/archive`),

  /**
   * US32 : télécharge la liste filtrée en CSV, avec les mêmes critères que la liste affichée mais
   * sans pagination. Renvoie le nom du fichier proposé.
   */
  exporter: (criteres: CriteresClients, signal?: AbortSignal): Promise<string> =>
    telecharger('/clients/export', {
      parametres: parametresDeCriteresClients(criteres),
      signal,
      nomParDefaut: nomDuFichierExport(new Date()),
    }),

  /** US31 : analyse le fichier sans rien enregistrer. */
  analyserImport: (demande: DemandeAnalyse): Promise<ReponseAnalyse> =>
    api.post<ReponseAnalyse>('/clients/import/analysis', demande),

  /** US31 : enregistre les lignes valides selon la stratégie choisie pour les doublons (RG28). */
  importer: (demande: DemandeImport): Promise<RapportImport> =>
    api.post<RapportImport>('/clients/import', demande),
};
