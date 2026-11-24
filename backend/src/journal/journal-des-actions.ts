import { Injectable, Logger } from '@nestjs/common';
import type { StatutIntervention } from '../generated/prisma/client.ts';

/** Changement de statut d'une intervention (RG07), nommé STATUT_MODIFIE dans le contrat d'API. */
export interface StatutModifie {
  type: 'STATUT_MODIFIE';
  interventionId: number;
  ancienStatut: StatutIntervention;
  nouveauStatut: StatutIntervention;
  auteurId: number;
  date: Date;
}

export type ActionJournalisee = StatutModifie;

/**
 * Point d'accroche du journal des actions MongoDB (card #27, Loïc).
 *
 * Les modules métier dépendent de cette classe abstraite, jamais de MongoDB : la card #27
 * fournit l'implémentation réelle dans JournalModule (useClass) sans toucher aux appelants.
 */
export abstract class JournalDesActions {
  abstract enregistrer(action: ActionJournalisee): Promise<void>;
}

/**
 * Implémentation d'attente : tant que MongoDB n'est pas branché, l'action est seulement tracée
 * dans les logs de l'API, pour qu'aucun changement de statut ne passe inaperçu.
 */
@Injectable()
export class JournalDesActionsDansLesLogs extends JournalDesActions {
  private readonly logger = new Logger('JournalDesActions');

  enregistrer(action: ActionJournalisee): Promise<void> {
    this.logger.log(
      `${action.type} intervention=${action.interventionId} ${action.ancienStatut} -> ${action.nouveauStatut} auteur=${action.auteurId}`,
    );
    return Promise.resolve();
  }
}
