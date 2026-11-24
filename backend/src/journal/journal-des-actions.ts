import type { ActionJournalisee, DocumentJournal, EntiteConsultee } from './journal.types.js';

export type { ActionJournalisee } from './journal.types.js';

/**
 * Journal des actions (RG07, US19), stocké dans MongoDB (ADR 0006).
 *
 * Mode d'emploi pour les modules métier (interventions #17, authentification #13) :
 * - injecter JournalDesActions dans le service (le module est global) ; ne jamais importer mongodb ;
 * - appeler `await this.journal.enregistrer({ type: 'STATUT_MODIFIE', auteur: { id, role }, … })`
 *   APRÈS la validation de la transaction PostgreSQL, jamais dedans : une action annulée par un
 *   rollback ne doit pas apparaître dans le journal ;
 * - la date est ajoutée par le journal (Horloge) : ne pas la passer ;
 * - enregistrer() ne lève jamais d'erreur : MongoDB indisponible, l'échec est tracé dans les logs
 *   de l'API et l'action métier reste valide. Aucun try/catch n'est nécessaire chez l'appelant ;
 * - pour CONNEXION_ECHOUEE, passer l'e-mail par masquerEmail() (masquer-email.ts).
 */
export abstract class JournalDesActions {
  abstract enregistrer(action: ActionJournalisee): Promise<void>;

  /**
   * Entrées d'une entité, de la plus récente à la plus ancienne, au plus `limite`.
   * Lève JournalIndisponible si MongoDB ne répond pas.
   */
  abstract historiqueDe(entite: EntiteConsultee, limite: number): Promise<DocumentJournal[]>;
}
