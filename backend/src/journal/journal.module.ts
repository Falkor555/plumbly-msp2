import { Global, Module } from '@nestjs/common';
import { Horloge } from '../commun/horloge.js';
import { ConnexionMongoDb } from './connexion-mongodb.js';
import { JournalDesActionsDansMongoDb } from './journal-des-actions-mongodb.js';
import { JournalDesActions } from './journal-des-actions.js';
import { JournalRepository } from './journal.repository.js';

// Global : chaque module qui change un statut ou un compte (tournées, interventions, auth)
// injecte JournalDesActions sans réimporter ce module.
@Global()
@Module({
  providers: [
    ConnexionMongoDb,
    JournalRepository,
    Horloge,
    { provide: JournalDesActions, useClass: JournalDesActionsDansMongoDb },
  ],
  exports: [JournalDesActions],
})
export class JournalModule {}
