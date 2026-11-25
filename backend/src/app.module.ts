import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthentificationModule } from './authentification/authentification.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { InterventionsModule } from './interventions/interventions.module.js';
import { JournalModule } from './journal/journal.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReportingModule } from './reporting/reporting.module.js';
import { TechniciensModule } from './techniciens/techniciens.module.js';
import { TourneesModule } from './tournees/tournees.module.js';
import { TypesInterventionModule } from './types-intervention/types-intervention.module.js';
import { UtilisateursModule } from './utilisateurs/utilisateurs.module.js';

@Module({
  imports: [
    AuthentificationModule,
    PrismaModule,
    JournalModule,
    ReportingModule,
    TourneesModule,
    ClientsModule,
    TechniciensModule,
    TypesInterventionModule,
    InterventionsModule,
    UtilisateursModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
