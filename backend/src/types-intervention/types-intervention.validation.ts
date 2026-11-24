import { BadRequestException } from '@nestjs/common';
import { type Champs, lireObjet, lireTexte, signalerErreurs } from '../commun/validation.js';
import { lireDuree } from '../interventions/duree.js';
import type {
  ModificationTypeIntervention,
  NouveauTypeIntervention,
} from './types-intervention.types.js';

/* Validation des données reçues par les routes des types d'intervention (contrat d'API, 6.4). */

const CHAMPS = ['libelle', 'dureeDefautMin'] as const;
// Longueur de la colonne libelle (modèle de données, 2.2).
const LONGUEUR_LIBELLE = 100;

export function lireNouveauType(corps: unknown): NouveauTypeIntervention {
  const champs = lireObjet(corps, CHAMPS);
  const erreurs: string[] = [];
  const type = lireChamps(champs, erreurs, { obligatoire: true });
  signalerErreurs(erreurs);
  return type as NouveauTypeIntervention;
}

/** Tous les champs sont facultatifs, mais une modification vide est refusée. */
export function lireModificationType(corps: unknown): ModificationTypeIntervention {
  const champs = lireObjet(corps, CHAMPS);
  const erreurs: string[] = [];
  const modification = lireChamps(champs, erreurs, { obligatoire: false });
  signalerErreurs(erreurs);
  if (Object.keys(modification).length === 0) {
    throw new BadRequestException(['Aucun champ à modifier']);
  }
  return modification;
}

function lireChamps(
  champs: Champs,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): ModificationTypeIntervention {
  const libelle = lireTexte(champs, 'libelle', erreurs, { obligatoire, maximum: LONGUEUR_LIBELLE });
  const dureeDefautMin = lireDuree(champs, 'dureeDefautMin', erreurs, { obligatoire });
  return {
    ...(typeof libelle === 'string' ? { libelle } : {}),
    ...(dureeDefautMin === undefined ? {} : { dureeDefautMin }),
  };
}
