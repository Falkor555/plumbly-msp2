import { Module } from '@nestjs/common';
import { Horloge } from '../commun/horloge.js';
import { TourneesController } from './tournees.controller.js';
import { TourneesRepository } from './tournees.repository.js';
import { TourneesService } from './tournees.service.js';

@Module({
  controllers: [TourneesController],
  providers: [TourneesRepository, TourneesService, Horloge],
})
export class TourneesModule {}
