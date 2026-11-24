/*
 * Types de transport (JSON) échangés avec l'API, alignés sur backend/src/tournees/tournees.types.ts
 * et sur le contrat d'API (docs/api.md, sections 4, 6.3 et 6.7). Les dates arrivent en chaînes
 * ISO 8601 (instants en UTC) et les jours de tournée au format AAAA-MM-JJ.
 */

export type Urgence = 'NORMALE' | 'PRIORITAIRE' | 'URGENTE';
export type StatutIntervention = 'A_PLANIFIER' | 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';
export type TypeClient = 'PARTICULIER' | 'PROFESSIONNEL';

/** Instant ISO 8601, par exemple « 2026-11-24T04:30:00.000Z ». */
export type DateHeureIso = string;
/** Jour au format « AAAA-MM-JJ ». */
export type DateIso = string;

/** Liste paginée (contrat d'API, section 4). */
export interface ListePaginee<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PersonneResume {
  id: number;
  nom: string;
  prenom: string;
}

export interface Intervention {
  id: number;
  description: string;
  urgence: Urgence;
  statut: StatutIntervention;
  dureeEstimeeMin: number;
  debutPrevu: DateHeureIso | null;
  finPrevue: DateHeureIso | null;
  enRetard: boolean;
  ordreTournee: number | null;
  compteRendu: string | null;
  motifAnnulation: string | null;
  demarreeLe: DateHeureIso | null;
  termineeLe: DateHeureIso | null;
  annuleeLe: DateHeureIso | null;
  creeLe: DateHeureIso;
  majLe: DateHeureIso;
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
  tournee: { id: number; dateTournee: DateIso; technicien: PersonneResume } | null;
  createur: PersonneResume;
}

export interface TechnicienResume extends PersonneResume {
  telephone: string;
  couleurPlanning: string;
}

export interface Tournee {
  id: number;
  dateTournee: DateIso;
  technicien: TechnicienResume;
  /** Triées par ordreTournee. */
  interventions: Intervention[];
}

export interface Indisponibilite {
  id: number;
  debut: DateHeureIso;
  fin: DateHeureIso;
  motif: string | null;
}

export interface TechnicienDuPlanning extends TechnicienResume {
  indisponibilites: Indisponibilite[];
  tournees: Omit<Tournee, 'technicien'>[];
}

/** GET /tours : tous les techniciens actifs, y compris ceux sans tournée (créneaux libres). */
export interface Planning {
  du: DateIso;
  au: DateIso;
  techniciens: TechnicienDuPlanning[];
}

export interface FiltresPlanning {
  du: DateIso;
  au: DateIso;
  technicienId?: number;
}

export interface NouvelleTournee {
  technicienId: number;
  dateTournee: DateIso;
}

export interface Affectation {
  interventionId: number;
  debutPrevu: DateHeureIso;
  /** Rang voulu ; à défaut, l'intervention passe en dernier. */
  ordreTournee?: number;
}
