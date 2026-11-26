import type { NouvelleIntervention, TypeIntervention, Urgence } from '../api/types';

/*
 * Saisie du formulaire d'une intervention (US14), avec les règles du contrat d'API (6.3)
 * vérifiées avant l'envoi : l'utilisateur voit tout ce qui manque en une fois, sans aller-retour.
 */

export const LONGUEUR_DESCRIPTION_MAX = 1000;
export const DUREE_MIN = 15;
export const DUREE_MAX = 720;

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
