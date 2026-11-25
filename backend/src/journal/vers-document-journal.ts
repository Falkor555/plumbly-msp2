import type {
  ActionJournalisee,
  AuteurJournal,
  DocumentJournal,
  EntiteJournalisee,
} from './journal.types.js';

/**
 * Traduit une action métier en document MongoDB (docs/modele-donnees.md, section 8.1).
 *
 * Chaque champ est recopié un par un : si un appelant passe un objet plus riche que prévu
 * (un utilisateur complet au lieu de { id, role }), le surplus n'arrive jamais dans le journal.
 */
export function versDocumentJournal(action: ActionJournalisee, date: Date): DocumentJournal {
  switch (action.type) {
    case 'STATUT_MODIFIE':
      return {
        ...enTete(action.type, date, action.auteur, intervention(action.interventionId)),
        avant: { statut: action.ancienStatut },
        apres: { statut: action.nouveauStatut },
      };
    case 'INTERVENTION_ANNULEE':
      return {
        ...enTete(action.type, date, action.auteur, intervention(action.interventionId)),
        avant: { statut: action.ancienStatut },
        apres: { statut: 'ANNULEE' },
        contexte: { motif: action.motif },
      };
    case 'SIGNATURE_ENREGISTREE':
      return {
        ...enTete(action.type, date, action.auteur, intervention(action.interventionId)),
        contexte: { empreinte: action.empreinte },
      };
    case 'CONNEXION_REUSSIE':
      return enTete(action.type, date, action.auteur, utilisateur(action.auteur.id));
    case 'CONNEXION_ECHOUEE':
      return {
        ...enTete(action.type, date, undefined, utilisateur(action.utilisateurId ?? null)),
        contexte: { emailMasque: action.emailMasque },
      };
    case 'COMPTE_CREE':
      return {
        ...enTete(action.type, date, action.auteur, utilisateur(action.utilisateurId)),
        apres: { role: action.role, actif: true },
      };
    case 'COMPTE_DESACTIVE':
      return {
        ...enTete(action.type, date, action.auteur, utilisateur(action.utilisateurId)),
        avant: { actif: true },
        apres: { actif: false },
      };
  }
}

function enTete(
  action: ActionJournalisee['type'],
  date: Date,
  auteur: AuteurJournal | undefined,
  entite: EntiteJournalisee,
): DocumentJournal {
  return auteur === undefined
    ? { date, action, entite }
    : { date, action, auteur: { id: auteur.id, role: auteur.role }, entite };
}

function intervention(id: number): EntiteJournalisee {
  return { type: 'intervention', id };
}

function utilisateur(id: number | null): EntiteJournalisee {
  return { type: 'utilisateur', id };
}
