import type { Role } from '../generated/prisma/client.ts';
import type { InterventionApi } from '../interventions/interventions.types.js';

// ---------- Données reçues, une fois validées ----------

/** POST /tours (US20). */
export interface NouvelleTournee {
  technicienId: number;
  dateTournee: string;
}

/** POST /tours/:id/interventions (US21). */
export interface Affectation {
  interventionId: number;
  debutPrevu: Date;
  /** Rang voulu dans la tournée ; à défaut, l'intervention passe en dernier. */
  ordreTournee?: number;
}

/** PUT /tours/:id/order (US22) : tous les identifiants de la tournée, dans le nouvel ordre. */
export interface NouvelOrdre {
  interventionIds: number[];
}

/** GET /tours (US23). */
export interface FiltresPlanning {
  du: string;
  au: string;
  technicienId?: number;
}

export interface Auteur {
  id: number;
  role: Role;
}

// ---------- Données renvoyées (contrat d'API, section 6.7) ----------

export interface TechnicienResume {
  id: number;
  nom: string;
  prenom: string;
  telephone: string;
  couleurPlanning: string;
}

export interface TourneeApi {
  id: number;
  dateTournee: string;
  technicien: TechnicienResume;
  /** Triées par ordreTournee. */
  interventions: InterventionApi[];
}

export interface IndisponibiliteApi {
  id: number;
  debut: Date;
  fin: Date;
  motif: string | null;
}

export interface PlanningTechnicien extends TechnicienResume {
  indisponibilites: IndisponibiliteApi[];
  tournees: Omit<TourneeApi, 'technicien'>[];
}

/** Planning de tous les techniciens actifs, y compris ceux sans tournée (créneaux libres). */
export interface PlanningApi {
  du: string;
  au: string;
  techniciens: PlanningTechnicien[];
}
