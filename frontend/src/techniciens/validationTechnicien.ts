import type { FicheTechnicien, ModificationTechnicien, NouveauTechnicien } from '../api/types';
import type { ErreursSaisie } from '../commun/saisie';
import { telephoneAEnvoyer, verifierTelephone } from '../commun/telephone';

/*
 * Saisie des formulaires technicien (US11). La validation reprend les règles de l'API
 * (backend/src/techniciens/techniciens.validation.ts) pour signaler chaque champ avant l'envoi :
 * c'est un confort, l'API reste seule juge et ses 400 et 409 s'affichent tels quels.
 */

/** Proposée quand on choisit soi-même la couleur : la sarcelle, première de la palette de l'API. */
export const COULEUR_PROPOSEE = '#0F766E';

/** L'API borne utilisateurId à un entier PostgreSQL (estUnIdentifiant) : 10 chiffres au plus. */
export const LONGUEUR_IDENTIFIANT_SAISI = 10;
const IDENTIFIANT_MAXIMUM = 2_147_483_647;
const FORMAT_IDENTIFIANT = /^\d+$/;

/** Le compte est choisi dans la liste (administrateur) ou son identifiant est tapé. */
export type SaisieDuCompte = 'liste' | 'identifiant';

/** Champs de la création, tels que saisis. */
export interface SaisieNouveauTechnicien {
  /** Identifiant du compte, choisi dans la liste ou tapé. */
  compte: string;
  telephone: string;
  /** null : la couleur est laissée au choix de l'API. */
  couleur: string | null;
}

/** Champs de la modification, tels que saisis. */
export interface SaisieTechnicien {
  telephone: string;
  /** #RRGGBB en majuscules, comme l'API l'enregistre. */
  couleur: string;
}

export const MESSAGES_TECHNICIEN = {
  compteAChoisir: 'Choisissez le compte du technicien dans la liste.',
  identifiantObligatoire: 'Saisissez l’identifiant du compte, par exemple 12.',
  identifiantInvalide: 'L’identifiant du compte est un nombre entier positif, par exemple 12.',
} as const;

export const SAISIE_NOUVEAU_TECHNICIEN: SaisieNouveauTechnicien = {
  compte: '',
  telephone: '',
  couleur: null,
};

/**
 * Identifiant tapé, ou null s'il ne peut désigner aucun compte. Des zéros en tête sont tolérés :
 * c'est le nombre qui part, l'API ne voit jamais le texte.
 */
export function lireIdentifiantDuCompte(saisie: string): number | null {
  const texte = saisie.trim();
  if (!FORMAT_IDENTIFIANT.test(texte)) return null;
  const identifiant = Number(texte);
  return identifiant >= 1 && identifiant <= IDENTIFIANT_MAXIMUM ? identifiant : null;
}

export function validerNouveauTechnicien(
  saisie: SaisieNouveauTechnicien,
  saisieDuCompte: SaisieDuCompte,
): ErreursSaisie<SaisieNouveauTechnicien> {
  const erreurs: ErreursSaisie<SaisieNouveauTechnicien> = {};
  const compte =
    saisieDuCompte === 'liste'
      ? verifierCompteChoisi(saisie.compte)
      : verifierIdentifiant(saisie.compte);
  if (compte) erreurs.compte = compte;
  const telephone = verifierTelephone(saisie.telephone);
  if (telephone) erreurs.telephone = telephone;
  return erreurs;
}

/**
 * POST /technicians, une fois la saisie validée. utilisateurId part en nombre : l'API refuse la
 * chaîne « 7 » (400). Sans couleur choisie, le champ est omis et l'API en attribue une.
 */
export function versNouveauTechnicien(saisie: SaisieNouveauTechnicien): NouveauTechnicien {
  const nouveau: NouveauTechnicien = {
    utilisateurId: Number(saisie.compte.trim()),
    telephone: telephoneAEnvoyer(saisie.telephone),
  };
  if (saisie.couleur !== null) nouveau.couleurPlanning = saisie.couleur.toUpperCase();
  return nouveau;
}

export function saisieDuTechnicien(technicien: FicheTechnicien): SaisieTechnicien {
  return { telephone: technicien.telephone, couleur: technicien.couleurPlanning.toUpperCase() };
}

export function validerTechnicien(saisie: SaisieTechnicien): ErreursSaisie<SaisieTechnicien> {
  const telephone = verifierTelephone(saisie.telephone);
  return telephone ? { telephone } : {};
}

/**
 * PATCH /technicians/:id : seuls les champs changés partent ; un objet vide signifie qu'il n'y a
 * rien à enregistrer. Les couleurs se comparent en majuscules : le champ couleur du navigateur les
 * écrit en minuscules, l'API en majuscules.
 */
export function versModificationTechnicien(
  initial: FicheTechnicien,
  saisie: SaisieTechnicien,
): ModificationTechnicien {
  const modification: ModificationTechnicien = {};
  const telephone = telephoneAEnvoyer(saisie.telephone);
  if (telephone !== initial.telephone) modification.telephone = telephone;
  const couleur = saisie.couleur.toUpperCase();
  if (couleur !== initial.couleurPlanning.toUpperCase()) modification.couleurPlanning = couleur;
  return modification;
}

function verifierCompteChoisi(saisie: string): string | undefined {
  return saisie === '' ? MESSAGES_TECHNICIEN.compteAChoisir : undefined;
}

function verifierIdentifiant(saisie: string): string | undefined {
  if (saisie.trim() === '') return MESSAGES_TECHNICIEN.identifiantObligatoire;
  return lireIdentifiantDuCompte(saisie) === null
    ? MESSAGES_TECHNICIEN.identifiantInvalide
    : undefined;
}
