import { Module } from '@nestjs/common';
import { TypesInterventionController } from './types-intervention.controller.js';
import { TypesInterventionRepository } from './types-intervention.repository.js';
import { TypesInterventionService } from './types-intervention.service.js';

@Module({
  controllers: [TypesInterventionController],
  providers: [TypesInterventionRepository, TypesInterventionService],
})
export class TypesInterventionModule {}
