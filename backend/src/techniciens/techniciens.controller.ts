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
import { TechniciensService } from './techniciens.service.js';
import type { TechnicienApi } from './techniciens.types.js';
import {
  lireFiltresTechniciens,
  lireModificationTechnicien,
  lireNouveauTechnicien,
} from './techniciens.validation.js';

/**
 * Routes des techniciens et de leurs indisponibilités (contrat d'API, sections 5.6 et 6.6).
 * Couche HTTP seulement : validation des entrées, droits, codes de retour.
 */
@Controller('technicians')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'GESTIONNAIRE')
export class TechniciensController {
  constructor(private readonly service: TechniciensService) {}

  /** US11 */
  @Get()
  lister(@Query() requete: Record<string, unknown>): Promise<PageApi<TechnicienApi>> {
    return this.service.lister(lireFiltresTechniciens(requete));
  }

  /** US11 */
  @Post()
  creer(@Body() corps: unknown): Promise<TechnicienApi> {
    return this.service.creer(lireNouveauTechnicien(corps));
  }

  @Get(':id')
  consulter(@Param('id') id: string): Promise<TechnicienApi> {
    return this.service.consulter(lireIdentifiant(id));
  }

  /** US11 */
  @Patch(':id')
  modifier(@Param('id') id: string, @Body() corps: unknown): Promise<TechnicienApi> {
    return this.service.modifier(lireIdentifiant(id), lireModificationTechnicien(corps));
  }

  /** US11 : renvoie le technicien archivé (200, aucune ressource n'est créée). */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archiver(@Param('id') id: string): Promise<TechnicienApi> {
    return this.service.archiver(lireIdentifiant(id));
  }
}
