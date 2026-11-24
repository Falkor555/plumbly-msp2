import type { Pagination } from '../commun/validation.js';

// ---------- Données reçues, une fois validées ----------

/** POST /technicians (US11) : la fiche d'un compte de rôle TECHNICIEN. */
export interface NouveauTechnicien {
  utilisateurId: number;
  telephone: string;
  /** À défaut, une couleur de la palette que personne n'utilise encore. */
  couleurPlanning?: string;
}

/** PATCH /technicians/:id (US11) : seuls les champs présents changent. */
export interface ModificationTechnicien {
  telephone?: string;
  couleurPlanning?: string;
}

export const TRIS_TECHNICIENS = ['nom', '-nom'] as const;
export type TriTechniciens = (typeof TRIS_TECHNICIENS)[number];

/** GET /technicians (US11). */
export interface FiltresTechniciens extends Pagination {
  recherche?: string;
  archives: boolean;
  tri: TriTechniciens;
}

/** POST /technicians/:id/unavailabilities (US12). */
export interface NouvelleIndisponibilite {
  debut: Date;
  fin: Date;
  motif: string | null;
}

/** GET /technicians/:id/unavailabilities : jours de La Réunion, bornes incluses. */
export interface PeriodeIndisponibilites {
  du?: string;
  au?: string;
}

// ---------- Données renvoyées (contrat d'API, section 6.6) ----------

/** Nom, prénom, e-mail et état du compte viennent du compte utilisateur lié, en lecture seule. */
export interface TechnicienApi {
  id: number;
  utilisateurId: number;
  nom: string;
  prenom: string;
  email: string;
  compteActif: boolean;
  telephone: string;
  couleurPlanning: string;
  archive: boolean;
  archiveLe: Date | null;
}
