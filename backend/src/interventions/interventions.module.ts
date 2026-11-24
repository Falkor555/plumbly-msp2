import { Module } from '@nestjs/common';
import { Horloge } from '../commun/horloge.js';
import { InterventionsController } from './interventions.controller.js';
import { InterventionsRepository } from './interventions.repository.js';
import { InterventionsService } from './interventions.service.js';

@Module({
  controllers: [InterventionsController],
  providers: [InterventionsRepository, InterventionsService, Horloge],
})
export class InterventionsModule {}
