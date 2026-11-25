import { Injectable, Logger } from '@nestjs/common';
import { Horloge } from '../commun/horloge.js';
import { JournalDesActions } from './journal-des-actions.js';
import { JournalRepository } from './journal.repository.js';
import type {
  ActionJournalisee,
  DocumentJournal,
  EntiteConsultee,
  EntiteJournalisee,
} from './journal.types.js';
import { versDocumentJournal } from './vers-document-journal.js';

/** Implémentation MongoDB du journal des actions (ADR 0006). */
@Injectable()
export class JournalDesActionsDansMongoDb extends JournalDesActions {
  private readonly logger = new Logger(JournalDesActions.name);

  constructor(
    private readonly depot: JournalRepository,
    private readonly horloge: Horloge,
  ) {
    super();
  }

  /**
   * L'écriture ne bloque jamais l'action métier (modèle de données 8.2) : l'erreur est tracée
   * avec le type d'action et l'entité, sans donnée personnelle, puis abandonnée.
   */
  async enregistrer(action: ActionJournalisee): Promise<void> {
    const document = versDocumentJournal(action, this.horloge.maintenant());
    try {
      await this.depot.inserer(document);
    } catch (erreur) {
      this.logger.error(
        `${document.action} non enregistré dans le journal des actions (${decrireEntite(document.entite)})`,
        erreur instanceof Error ? erreur.stack : String(erreur),
      );
    }
  }

  historiqueDe(entite: EntiteConsultee, limite: number): Promise<DocumentJournal[]> {
    return this.depot.listerPourEntite(entite, limite);
  }
}

function decrireEntite(entite: EntiteJournalisee): string {
  return `${entite.type} ${entite.id ?? 'inconnu'}`;
}
