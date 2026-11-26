import type { Role } from './auth.api';
import { api } from './clientHttp';
import { parametresDePagination } from './parametres';
import type { DateHeureIso, ListePaginee, Pagination } from './types';

/** Compte utilisateur renvoyé par GET /users (contrat d'API, 6.2) : jamais le mot de passe. */
export interface CompteUtilisateur {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  actif: boolean;
  mdpAChanger: boolean;
  derniereConnexion: DateHeureIso | null;
  creeLe: DateHeureIso;
}

/** Tris acceptés par GET /users (backend/src/utilisateurs/utilisateurs.types.ts). */
export type TriComptes = 'nom' | '-nom';

/** GET /users (US03) : sans rôle ni état, tous les comptes sont listés. */
export interface FiltresComptes extends Pagination {
  role?: Role;
  actif?: boolean;
  tri?: TriComptes;
}

export const utilisateursApi = {
  /** Réservé à l'administrateur : un gestionnaire reçoit 403. */
  lister: (
    filtres: FiltresComptes,
    signal?: AbortSignal,
  ): Promise<ListePaginee<CompteUtilisateur>> =>
    api.get<ListePaginee<CompteUtilisateur>>('/users', {
      parametres: {
        role: filtres.role,
        actif: filtres.actif,
        tri: filtres.tri,
        ...parametresDePagination(filtres),
      },
      signal,
    }),
};
