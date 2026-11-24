import type { Pagination } from '../commun/validation.js';
import type { StatutIntervention, TypeClient, Urgence } from '../generated/prisma/client.ts';

// ---------- Données reçues, une fois validées ----------

/** POST /interventions (US14). Le client n'est pas envoyé : il est déduit de l'adresse. */
export interface NouvelleIntervention {
  adresseId: number;
  typeInterventionId: number;
  description: string;
  urgence: Urgence;
  /** À défaut, la durée par défaut du type. */
  dureeEstimeeMin?: number;
}

/** PATCH /interventions/:id (US16) : au moins un champ ; ni statut, ni tournée, ni rang. */
export type ModificationIntervention = Partial<
  Pick<
    NouvelleIntervention,
    'adresseId' | 'typeInterventionId' | 'description' | 'urgence' | 'dureeEstimeeMin'
  >
>;

/** Valeurs de tri de GET /interventions ; « -urgence » est l'ordre de RG18. */
export const TRIS_INTERVENTIONS = [
  '-urgence',
  'creeLe',
  '-creeLe',
  'debutPrevu',
  '-debutPrevu',
] as const;
export type TriInterventions = (typeof TRIS_INTERVENTIONS)[number];

/** GET /interventions (US15) : tous les filtres se combinent. */
export interface FiltresInterventions extends Pagination {
  tri: TriInterventions;
  recherche?: string;
  statuts?: StatutIntervention[];
  urgence?: Urgence;
  technicienId?: number;
  clientId?: number;
  /** Jours à La Réunion (AAAA-MM-JJ), bornes incluses, sur le début prévu. */
  du?: string;
  au?: string;
}

/** POST /interventions/:id/cancel */
export interface Annulation {
  motif: string;
}

/** POST /interventions/:id/complete : compte rendu facultatif. */
export interface FinDIntervention {
  compteRendu?: string;
}

/** PATCH /interventions/:id/report */
export interface CompteRendu {
  compteRendu: string;
}

// ---------- Données renvoyées (contrat d'API, section 6.3) ----------

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
