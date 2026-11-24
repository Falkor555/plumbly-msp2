import type { Role, StatutIntervention, TypeClient, Urgence } from '../generated/prisma/client.ts';

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

// ---------- Données renvoyées (contrat d'API, sections 6.3 et 6.7) ----------

export interface InterventionApi {
  id: number;
  description: string;
  urgence: Urgence;
  statut: StatutIntervention;
  dureeEstimeeMin: number;
  debutPrevu: Date | null;
  finPrevue: Date | null;
  enRetard: boolean;
  ordreTournee: number | null;
  compteRendu: string | null;
  motifAnnulation: string | null;
  demarreeLe: Date | null;
  termineeLe: Date | null;
  annuleeLe: Date | null;
  creeLe: Date;
  majLe: Date;
  type: { id: number; libelle: string };
  adresse: {
    id: number;
    rue: string;
    complement: string | null;
    codePostal: string;
    ville: string;
    infosAcces: string | null;
  };
  client: { id: number; typeClient: TypeClient; nomAffiche: string; telephone: string };
  tournee: {
    id: number;
    dateTournee: string;
    technicien: { id: number; nom: string; prenom: string };
  } | null;
  createur: { id: number; nom: string; prenom: string };
}

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
