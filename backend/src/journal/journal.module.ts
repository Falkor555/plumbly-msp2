import { Global, Module } from '@nestjs/common';
import { JournalDesActions, JournalDesActionsDansLesLogs } from './journal-des-actions.js';

// Global : chaque module qui change un statut (tournées, interventions) injecte JournalDesActions.
// Card #27 : remplacer useClass par l'implémentation MongoDB.
@Global()
@Module({
  providers: [{ provide: JournalDesActions, useClass: JournalDesActionsDansLesLogs }],
  exports: [JournalDesActions],
})
export class JournalModule {}
