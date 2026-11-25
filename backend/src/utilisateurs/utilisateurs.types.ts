import type { Pagination } from '../commun/validation.js';
import type { Role } from '../generated/prisma/client.ts';

/** Objet Utilisateur du contrat d'API (6.2) : jamais le hash du mot de passe. */
export interface UtilisateurApi {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  actif: boolean;
  mdpAChanger: boolean;
  derniereConnexion: Date | null;
  creeLe: Date;
}

/** PATCH /users/me : seuls le nom et le prénom ; l'e-mail et le rôle relèvent de l'administrateur. */
export interface ModificationProfil {
  nom?: string;
  prenom?: string;
}

/** PATCH /users/me/password. */
export interface ChangementMotDePasse {
  ancienMotDePasse: string;
  nouveauMotDePasse: string;
}

export const TRIS_UTILISATEURS = ['nom', '-nom'] as const;
export type TriUtilisateurs = (typeof TRIS_UTILISATEURS)[number];

/** GET /users (US03). Sans role ni actif, tous les comptes sont listés. */
export interface FiltresUtilisateurs extends Pagination {
  recherche?: string;
  role?: Role;
  actif?: boolean;
  tri: TriUtilisateurs;
}

/** POST /users (US03) : le mot de passe n'est pas envoyé, le serveur le génère. */
export interface NouvelUtilisateur {
  email: string;
  nom: string;
  prenom: string;
  role: Role;
}

/** PATCH /users/:id (US03). */
export interface ModificationUtilisateur {
  email?: string;
  nom?: string;
  prenom?: string;
  role?: Role;
}

/** Réponse de POST /users : le mot de passe provisoire n'apparaît que dans cette réponse. */
export interface CompteCree {
  utilisateur: UtilisateurApi;
  motDePasseProvisoire: string;
}
