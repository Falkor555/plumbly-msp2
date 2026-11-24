/** Objet Type d'intervention du contrat d'API (section 6.4). */
export interface TypeInterventionApi {
  id: number;
  libelle: string;
  dureeDefautMin: number;
}

/** POST /intervention-types, une fois validé. */
export interface NouveauTypeIntervention {
  libelle: string;
  dureeDefautMin: number;
}

/** PATCH /intervention-types/:id : au moins un champ. */
export type ModificationTypeIntervention = Partial<NouveauTypeIntervention>;
