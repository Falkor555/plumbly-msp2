import { Module } from '@nestjs/common';
import { ReportingRepository } from './reporting.repository.js';
import { ReportingService } from './reporting.service.js';

// Pas encore de contrôleur : les routes du tableau de bord attendent le contrat d'API (#32).
@Module({
  providers: [ReportingRepository, ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
