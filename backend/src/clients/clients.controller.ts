import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../commun/autorisation/roles.guard.js';
import { lireIdentifiant, type PageApi } from '../commun/validation.js';
import type { InterventionApi } from '../tournees/tournees.types.js';
import { ClientsService } from './clients.service.js';
import type { ClientApi } from './clients.types.js';
import {
  lireFiltresClients,
  lireFiltresHistorique,
  lireModificationClient,
  lireNouveauClient,
} from './clients.validation.js';

/**
 * Routes des clients et de leurs adresses (contrat d'API, sections 5.5 et 6.5).
 * Couche HTTP seulement : validation des entrées, droits, codes de retour.
 */
@Controller('clients')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'GESTIONNAIRE')
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  /** US08 */
  @Get()
  lister(@Query() requete: Record<string, unknown>): Promise<PageApi<ClientApi>> {
    return this.service.lister(lireFiltresClients(requete));
  }

  /** US06 */
  @Post()
  creer(@Body() corps: unknown): Promise<ClientApi> {
    return this.service.creer(lireNouveauClient(corps));
  }

  @Get(':id')
  consulter(@Param('id') id: string): Promise<ClientApi> {
    return this.service.consulter(lireIdentifiant(id));
  }

  /** US10 */
  @Patch(':id')
  modifier(@Param('id') id: string, @Body() corps: unknown): Promise<ClientApi> {
    return this.service.modifier(lireIdentifiant(id), lireModificationClient(corps));
  }

  /** US10 : renvoie le client archivé (200, aucune ressource n'est créée). */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archiver(@Param('id') id: string): Promise<ClientApi> {
    return this.service.archiver(lireIdentifiant(id));
  }

  /** US09 */
  @Get(':id/interventions')
  historique(
    @Param('id') id: string,
    @Query() requete: Record<string, unknown>,
  ): Promise<PageApi<InterventionApi>> {
    return this.service.historique(lireIdentifiant(id), lireFiltresHistorique(requete));
  }
}
