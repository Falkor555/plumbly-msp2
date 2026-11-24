import { Module } from '@nestjs/common';
import { Horloge } from '../commun/horloge.js';
import { TechniciensController } from './techniciens.controller.js';
import { TechniciensRepository } from './techniciens.repository.js';
import { TechniciensService } from './techniciens.service.js';

@Module({
  controllers: [TechniciensController],
  providers: [TechniciensRepository, TechniciensService, Horloge],
})
export class TechniciensModule {}
