import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Horloge } from '../commun/horloge.js';
import { ConnexionMongoDb } from './connexion-mongodb.js';
import { FiltreAccesRefuse } from './filtre-acces-refuse.js';
import { HistoriqueController } from './historique.controller.js';
import { HistoriqueRepository } from './historique.repository.js';
import { HistoriqueService } from './historique.service.js';
import { JournalDesActionsDansMongoDb } from './journal-des-actions-mongodb.js';
import { JournalDesActions } from './journal-des-actions.js';
import { JournalRepository } from './journal.repository.js';

// Global : chaque module qui change un statut ou un compte (tournées, interventions, auth)
// injecte JournalDesActions sans réimporter ce module.
@Global()
@Module({
  // Route d'historique des interventions : elle ne lit que le journal (voir historique.controller.ts).
  controllers: [HistoriqueController],
  providers: [
    // Filtre global déclaré ici plutôt que dans main.ts : l'application de test l'a aussi.
    { provide: APP_FILTER, useClass: FiltreAccesRefuse },
    ConnexionMongoDb,
    JournalRepository,
    Horloge,
    { provide: JournalDesActions, useClass: JournalDesActionsDansMongoDb },
    HistoriqueRepository,
    HistoriqueService,
  ],
  exports: [JournalDesActions],
})
export class JournalModule {}
