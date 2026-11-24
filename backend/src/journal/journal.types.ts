import type { Role, StatutIntervention } from '../generated/prisma/client.ts';

/*
 * Types du journal des actions (docs/modele-donnees.md, section 8). Chaque action ne porte que
 * des champs typés (identifiants, statuts, rôle) : aucun objet libre ne peut y faire entrer un
 * mot de passe, un nom ou une adresse.
 */

/** Utilisateur qui a agi : son identifiant et son rôle, jamais son nom ni son e-mail. */
export interface AuteurJournal {
  id: number;
  role: Role;
}

/**
 * E-mail déjà masqué par masquerEmail() (k***@exemple.fr). Le type marqué empêche de passer
 * l'e-mail saisi tel quel : seul masquerEmail() fabrique une valeur de ce type.
 */
export type EmailMasque = string & { readonly __marque: 'EmailMasque' };

export interface StatutModifie {
  type: 'STATUT_MODIFIE';
  auteur: AuteurJournal;
  interventionId: number;
  ancienStatut: StatutIntervention;
  nouveauStatut: StatutIntervention;
}

export interface InterventionAnnulee {
  type: 'INTERVENTION_ANNULEE';
  auteur: AuteurJournal;
  interventionId: number;
  ancienStatut: StatutIntervention;
  /** Déjà limité à 500 caractères par le contrat d'API. */
  motif: string;
}

export interface ConnexionReussie {
  type: 'CONNEXION_REUSSIE';
  auteur: AuteurJournal;
}

/** Sans auteur : personne n'est authentifié. */
export interface ConnexionEchouee {
  type: 'CONNEXION_ECHOUEE';
  emailMasque: EmailMasque;
  /** Compte visé, s'il existe ; absent pour un e-mail inconnu. */
  utilisateurId?: number;
}

export interface CompteCree {
  type: 'COMPTE_CREE';
  auteur: AuteurJournal;
  utilisateurId: number;
  role: Role;
}

export interface CompteDesactive {
  type: 'COMPTE_DESACTIVE';
  auteur: AuteurJournal;
  utilisateurId: number;
}

export type ActionJournalisee =
  | StatutModifie
  | InterventionAnnulee
  | ConnexionReussie
  | ConnexionEchouee
  | CompteCree
  | CompteDesactive;

export type TypeAction = ActionJournalisee['type'];

export type TypeEntite = 'intervention' | 'utilisateur';

/** id vaut null seulement pour une connexion échouée sur un e-mail inconnu. */
export interface EntiteJournalisee {
  type: TypeEntite;
  id: number | null;
}

/** Entité dont on lit l'historique : toujours un identifiant connu. */
export interface EntiteConsultee {
  type: TypeEntite;
  id: number;
}

export type ValeurJournal = string | number | boolean | null | { [cle: string]: ValeurJournal };
export type DonneesJournal = { [cle: string]: ValeurJournal };

/** Document de la collection journal_actions, sans _id (généré par MongoDB). */
export interface DocumentJournal {
  date: Date;
  action: TypeAction;
  auteur?: AuteurJournal;
  entite: EntiteJournalisee;
  avant?: DonneesJournal;
  apres?: DonneesJournal;
  contexte?: DonneesJournal;
}

/** Lecture du journal impossible (MongoDB injoignable) : l'historique répond 503. */
export class JournalIndisponible extends Error {
  constructor(options?: ErrorOptions) {
    super('Journal des actions indisponible.', options);
    this.name = 'JournalIndisponible';
  }
}
