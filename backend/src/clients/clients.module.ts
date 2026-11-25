import { Module } from '@nestjs/common';
import { Horloge } from '../commun/horloge.js';
import { ClientsController } from './clients.controller.js';
import { ClientsRepository } from './clients.repository.js';
import { ClientsService } from './clients.service.js';
import { ImportClientsRepository } from './import/import-clients.repository.js';
import { ImportClientsService } from './import/import-clients.service.js';

@Module({
  controllers: [ClientsController],
  providers: [
    ClientsRepository,
    ClientsService,
    ImportClientsRepository,
    ImportClientsService,
    Horloge,
  ],
})
export class ClientsModule {}
