import { api } from './clientHttp';
import type { Client, ListePaginee } from './types';

/** Assez pour reconnaître le bon client ; au-delà, on demande d'affiner la recherche. */
export const NOMBRE_CLIENTS_PROPOSES = 10;

export const clientsApi = {
  /** US08 et US14 : recherche sur le nom, le téléphone et la ville (2 caractères minimum). */
  rechercher: (recherche: string, signal?: AbortSignal): Promise<ListePaginee<Client>> =>
    api.get<ListePaginee<Client>>('/clients', {
      parametres: { recherche, limit: NOMBRE_CLIENTS_PROPOSES },
      signal,
    }),
};
