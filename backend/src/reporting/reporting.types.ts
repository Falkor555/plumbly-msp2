import type { StatutIntervention, Urgence } from '../generated/prisma/client.ts';

/** Période de reporting en jours calendaires de La Réunion, bornes incluses (AAAA-MM-JJ). */
export interface Periode {
  du: string;
  au: string;
}

/** Requête 1 : une ligne par technicien actif, un compteur par statut. */
export interface InterventionsParStatut {
  idTechnicien: number;
  nom: string;
  prenom: string;
  total: number;
  aPlanifier: number;
  planifiees: number;
  enCours: number;
  terminees: number;
  annulees: number;
}

/** Requête 2 : une étape de la tournée, dans l'ordre de passage. */
export interface EtapeTournee {
  ordre: number;
  idIntervention: number;
  statut: StatutIntervention;
  urgence: Urgence;
  debutPrevu: Date;
  finPrevue: Date;
  dureeEstimeeMin: number;
  typeIntervention: string;
  description: string;
  client: string;
  telephoneClient: string;
  rue: string;
  complement: string | null;
  codePostal: string;
  ville: string;
  infosAcces: string | null;
}

export interface TourneeDetaillee {
  idTournee: number;
  dateTournee: string;
  idTechnicien: number;
  nomTechnicien: string;
  prenomTechnicien: string;
  etapes: EtapeTournee[];
}

/** Requête 3 : durées réelles sur place comparées aux durées estimées, en minutes. */
export interface TempsDeTraitement {
  nombreInterventions: number;
  dureeMoyenneMin: number | null;
  dureeEstimeeMoyenneMin: number | null;
}

export interface TempsDeTraitementParType extends TempsDeTraitement {
  typeIntervention: string;
}

export interface TempsMoyenDeTraitement {
  parType: TempsDeTraitementParType[];
  ensemble: TempsDeTraitement;
}
