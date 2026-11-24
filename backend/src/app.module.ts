import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ClientsModule } from './clients/clients.module.js';
import { JournalModule } from './journal/journal.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReportingModule } from './reporting/reporting.module.js';
import { TechniciensModule } from './techniciens/techniciens.module.js';
import { TourneesModule } from './tournees/tournees.module.js';

@Module({
  imports: [
    PrismaModule,
    JournalModule,
    ReportingModule,
    TourneesModule,
    ClientsModule,
    TechniciensModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
