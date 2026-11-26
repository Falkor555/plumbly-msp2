import type { FiltresInterventions } from '../api/interventions.api';
import type { DateIso, StatutIntervention, Urgence } from '../api/types';
import { ajouterJours, lundiDeLaSemaine } from '../commun/dates';

/*
 * Filtres de la liste des interventions (US15), gardés dans l'adresse de la page : ils sont
 * conservés au rechargement, suivent les boutons précédent / suivant et se partagent par lien.
 */

export const STATUTS: readonly StatutIntervention[] = [
  'A_PLANIFIER',
  'PLANIFIEE',
  'EN_COURS',
  'TERMINEE',
  'ANNULEE',
];
export const URGENCES: readonly Urgence[] = ['URGENTE', 'PRIORITAIRE', 'NORMALE'];

const LONGUEUR_RECHERCHE_MINIMUM = 2;
const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Saisie en cours dans le formulaire, avant application. */
export interface Brouillon {
  recherche: string;
  statut: string;
  urgence: string;
  du: string;
  au: string;
}

/** Une adresse modifiée à la main ne casse pas la page : une valeur inconnue est ignorée. */
export function lireFiltres(parametres: URLSearchParams): FiltresInterventions {
  const filtres: FiltresInterventions = { page: 1 };
  const statut = parametres.get('statut');
  if (STATUTS.includes(statut as StatutIntervention)) {
    filtres.statut = statut as StatutIntervention;
  }
  const urgence = parametres.get('urgence');
  if (URGENCES.includes(urgence as Urgence)) {
    filtres.urgence = urgence as Urgence;
  }
  const recherche = parametres.get('recherche')?.trim();
  if (recherche !== undefined && recherche.length >= LONGUEUR_RECHERCHE_MINIMUM) {
    filtres.recherche = recherche;
  }
  for (const nom of ['du', 'au'] as const) {
    const jour = parametres.get(nom);
    if (jour !== null && FORMAT_JOUR.test(jour)) {
      filtres[nom] = jour;
    }
  }
  const page = Number(parametres.get('page'));
  if (Number.isInteger(page) && page > 1) {
    filtres.page = page;
  }
  return filtres;
}

export function versParametres(filtres: FiltresInterventions): URLSearchParams {
  const parametres = new URLSearchParams();
  for (const nom of ['recherche', 'statut', 'urgence', 'du', 'au'] as const) {
    const valeur = filtres[nom];
    if (valeur !== undefined) {
      parametres.set(nom, valeur);
    }
  }
  if (filtres.page > 1) {
    parametres.set('page', String(filtres.page));
  }
  return parametres;
}

export function versBrouillon(filtres: FiltresInterventions): Brouillon {
  return {
    recherche: filtres.recherche ?? '',
    statut: filtres.statut ?? '',
    urgence: filtres.urgence ?? '',
    du: filtres.du ?? '',
    au: filtres.au ?? '',
  };
}

/** Saisies que l'API refuserait en 400 : signalées avant l'envoi. */
export function erreursDuBrouillon(brouillon: Brouillon): string[] {
  const erreurs: string[] = [];
  const recherche = brouillon.recherche.trim();
  if (recherche.length > 0 && recherche.length < LONGUEUR_RECHERCHE_MINIMUM) {
    erreurs.push(`La recherche doit contenir au moins ${LONGUEUR_RECHERCHE_MINIMUM} caractères.`);
  }
  if (brouillon.du !== '' && brouillon.au !== '' && brouillon.du > brouillon.au) {
    erreurs.push('La date de début doit précéder la date de fin.');
  }
  return erreurs;
}

/** Filtres appliqués à partir du formulaire : toujours depuis la première page. */
export function depuisBrouillon(brouillon: Brouillon): FiltresInterventions {
  const remplis = Object.entries(brouillon).filter(([, valeur]) => valeur.trim() !== '');
  return lireFiltres(new URLSearchParams(remplis));
}

export interface FiltrePret {
  libelle: string;
  filtres: FiltresInterventions;
}

/**
 * #49 : les listes que le bureau consulte le plus, en un clic. Elles remplissent les filtres
 * ordinaires, qui restent modifiables ; rien n'est enregistré. Les jours sont ceux de La Réunion.
 */
export function filtresPrets(aujourdhui: DateIso): FiltrePret[] {
  const lundi = lundiDeLaSemaine(aujourdhui);
  return [
    {
      libelle: 'Urgentes à planifier',
      filtres: { page: 1, statut: 'A_PLANIFIER', urgence: 'URGENTE' },
    },
    { libelle: 'À planifier', filtres: { page: 1, statut: 'A_PLANIFIER' } },
    { libelle: 'En cours', filtres: { page: 1, statut: 'EN_COURS' } },
    { libelle: 'Aujourd’hui', filtres: { page: 1, du: aujourdhui, au: aujourdhui } },
    { libelle: 'Cette semaine', filtres: { page: 1, du: lundi, au: ajouterJours(lundi, 6) } },
  ];
}

/** Même liste, quelle que soit la page affichée : sert à marquer le filtre prêt actif. */
export function memesFiltres(a: FiltresInterventions, b: FiltresInterventions): boolean {
  return (
    versParametres({ ...a, page: 1 }).toString() === versParametres({ ...b, page: 1 }).toString()
  );
}
