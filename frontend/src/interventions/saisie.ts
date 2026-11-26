import type {
  Intervention,
  ModificationIntervention,
  NouvelleIntervention,
  StatutIntervention,
  TypeIntervention,
  Urgence,
} from '../api/types';

/*
 * Saisie du formulaire d'une intervention (US14), avec les règles du contrat d'API (6.3)
 * vérifiées avant l'envoi : l'utilisateur voit tout ce qui manque en une fois, sans aller-retour.
 */

export const LONGUEUR_DESCRIPTION_MAX = 1000;
export const DUREE_MIN = 15;
export const DUREE_MAX = 720;
export const LONGUEUR_MOTIF_MAX = 500;

/** Une intervention en cours, terminée ou annulée ne se modifie plus (RG06, RG15). */
export const STATUTS_MODIFIABLES: readonly StatutIntervention[] = ['A_PLANIFIER', 'PLANIFIEE'];
/** Une intervention s'annule tant qu'elle n'est ni terminée ni déjà annulée (RG05). */
export const STATUTS_ANNULABLES: readonly StatutIntervention[] = [
  'A_PLANIFIER',
  'PLANIFIEE',
  'EN_COURS',
];

export interface Saisie {
  /** null tant que le client et son adresse ne sont pas choisis. */
  adresseId: number | null;
  /** Valeurs des champs, en texte, telles que le navigateur les donne. */
  typeInterventionId: string;
  dureeEstimeeMin: string;
  urgence: Urgence;
  description: string;
}

export const SAISIE_VIDE: Saisie = {
  adresseId: null,
  typeInterventionId: '',
  dureeEstimeeMin: '',
  urgence: 'NORMALE',
  description: '',
};

/** Choisir un type préremplit la durée avec sa durée par défaut (US14). */
export function avecType(saisie: Saisie, type: TypeIntervention | undefined): Saisie {
  return {
    ...saisie,
    typeInterventionId: type ? String(type.id) : '',
    dureeEstimeeMin: type ? String(type.dureeDefautMin) : saisie.dureeEstimeeMin,
  };
}

export function erreursDeLaSaisie(saisie: Saisie): string[] {
  const erreurs: string[] = [];
  if (saisie.adresseId === null) {
    erreurs.push('Choisissez le client, puis l’adresse de l’intervention.');
  }
  if (saisie.typeInterventionId === '') {
    erreurs.push('Choisissez le type d’intervention.');
  }
  const duree = Number(saisie.dureeEstimeeMin);
  if (
    saisie.dureeEstimeeMin.trim() === '' ||
    !Number.isInteger(duree) ||
    duree < DUREE_MIN ||
    duree > DUREE_MAX
  ) {
    erreurs.push(
      `La durée estimée doit être un nombre entier de minutes, entre ${DUREE_MIN} et ${DUREE_MAX}.`,
    );
  }
  const description = saisie.description.trim();
  if (description === '') {
    erreurs.push('Décrivez la demande du client.');
  } else if (description.length > LONGUEUR_DESCRIPTION_MAX) {
    erreurs.push(`La description ne doit pas dépasser ${LONGUEUR_DESCRIPTION_MAX} caractères.`);
  }
  return erreurs;
}

/** À n'appeler que sur une saisie sans erreur. */
export function versNouvelleIntervention(saisie: Saisie): NouvelleIntervention {
  return {
    adresseId: saisie.adresseId as number,
    typeInterventionId: Number(saisie.typeInterventionId),
    description: saisie.description.trim(),
    urgence: saisie.urgence,
    dureeEstimeeMin: Number(saisie.dureeEstimeeMin),
  };
}

/** US16 : le formulaire de modification part des valeurs actuelles de l'intervention. */
export function depuisIntervention(intervention: Intervention): Saisie {
  return {
    adresseId: intervention.adresse.id,
    typeInterventionId: String(intervention.type.id),
    dureeEstimeeMin: String(intervention.dureeEstimeeMin),
    urgence: intervention.urgence,
    description: intervention.description,
  };
}

/**
 * Seuls les champs changés partent : un PATCH ne touche pas au reste, et une durée inchangée
 * ne relance pas le contrôle de chevauchement de la tournée (RG09). Objet vide : rien à envoyer.
 */
export function versModification(
  saisie: Saisie,
  intervention: Intervention,
): ModificationIntervention {
  const voulue = versNouvelleIntervention(saisie);
  const modification: ModificationIntervention = {};
  if (voulue.typeInterventionId !== intervention.type.id) {
    modification.typeInterventionId = voulue.typeInterventionId;
  }
  if (voulue.dureeEstimeeMin !== intervention.dureeEstimeeMin) {
    modification.dureeEstimeeMin = voulue.dureeEstimeeMin;
  }
  if (voulue.urgence !== intervention.urgence) {
    modification.urgence = voulue.urgence;
  }
  if (voulue.description !== intervention.description) {
    modification.description = voulue.description;
  }
  return modification;
}

/** RG05 : le motif d'annulation est obligatoire. */
export function erreursDuMotif(motif: string): string[] {
  const texte = motif.trim();
  if (texte === '') return ['Indiquez le motif de l’annulation.'];
  if (texte.length > LONGUEUR_MOTIF_MAX) {
    return [`Le motif ne doit pas dépasser ${LONGUEUR_MOTIF_MAX} caractères.`];
  }
  return [];
}
