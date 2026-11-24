import type { Intervention, StatutIntervention, Urgence } from '../api/types';
import { heureMetier } from '../commun/dates';

export const LIBELLES_STATUT: Record<StatutIntervention, string> = {
  A_PLANIFIER: 'À planifier',
  PLANIFIEE: 'Planifiée',
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  ANNULEE: 'Annulée',
};

/** Classes Tailwind des badges de statut (charte : couleurs d'état). */
export const CLASSES_STATUT: Record<StatutIntervention, string> = {
  A_PLANIFIER: 'bg-white text-gris-texte ring-bordure',
  PLANIFIEE: 'bg-sarcelle-claire text-sarcelle-profonde ring-sarcelle/20',
  EN_COURS: 'bg-blue-50 text-info ring-info/20',
  TERMINEE: 'bg-green-50 text-succes ring-succes/20',
  ANNULEE: 'bg-gray-100 text-gris-texte ring-bordure line-through',
};

export const LIBELLES_URGENCE: Record<Urgence, string> = {
  NORMALE: 'Normale',
  PRIORITAIRE: 'Prioritaire',
  URGENTE: 'Urgente',
};

const COULEUR_PAR_DEFAUT = '#0F766E';

/**
 * La couleur vient de la fiche technicien (saisie libre côté back-office) : seule une couleur
 * hexadécimale est appliquée au style, sinon on reprend la sarcelle de la charte.
 */
export function couleurTechnicien(couleur: string): string {
  return /^#[0-9a-f]{6}$/i.test(couleur) ? couleur : COULEUR_PAR_DEFAUT;
}

/** « 08:30–09:30 », ou « Horaire à définir » si l'intervention n'a pas encore de créneau. */
export function creneau(intervention: Pick<Intervention, 'debutPrevu' | 'finPrevue'>): string {
  if (!intervention.debutPrevu || !intervention.finPrevue) return 'Horaire à définir';
  return `${heureMetier(intervention.debutPrevu)}–${heureMetier(intervention.finPrevue)}`;
}

export function nomComplet(personne: { prenom: string; nom: string }): string {
  return `${personne.prenom} ${personne.nom}`;
}
