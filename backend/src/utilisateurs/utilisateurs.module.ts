import { Module } from '@nestjs/common';
import { Horloge } from '../commun/horloge.js';
import { UtilisateursController } from './utilisateurs.controller.js';
import { UtilisateursRepository } from './utilisateurs.repository.js';
import { UtilisateursService } from './utilisateurs.service.js';

@Module({
  controllers: [UtilisateursController],
  providers: [UtilisateursRepository, UtilisateursService, Horloge],
})
export class UtilisateursModule {}
