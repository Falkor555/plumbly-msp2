import {
  Body,
  Controller,
  Delete,
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
import type { IndisponibiliteApi } from '../tournees/tournees.types.js';
import { TechniciensService } from './techniciens.service.js';
import type { TechnicienApi } from './techniciens.types.js';
import {
  lireFiltresTechniciens,
  lireModificationTechnicien,
  lireNouveauTechnicien,
  lireNouvelleIndisponibilite,
  lirePeriodeIndisponibilites,
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

  /** US12 : liste triée par date de début, non paginée. */
  @Get(':id/unavailabilities')
  listerIndisponibilites(
    @Param('id') id: string,
    @Query() requete: Record<string, unknown>,
  ): Promise<IndisponibiliteApi[]> {
    return this.service.listerIndisponibilites(
      lireIdentifiant(id),
      lirePeriodeIndisponibilites(requete),
    );
  }

  /** US12 et RG10 */
  @Post(':id/unavailabilities')
  ajouterIndisponibilite(
    @Param('id') id: string,
    @Body() corps: unknown,
  ): Promise<IndisponibiliteApi> {
    return this.service.ajouterIndisponibilite(
      lireIdentifiant(id),
      lireNouvelleIndisponibilite(corps),
    );
  }

  /** US12 */
  @Delete(':id/unavailabilities/:unavailabilityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  supprimerIndisponibilite(
    @Param('id') id: string,
    @Param('unavailabilityId') idIndisponibilite: string,
  ): Promise<void> {
    return this.service.supprimerIndisponibilite(
      lireIdentifiant(id),
      lireIdentifiant(idIndisponibilite),
    );
  }
}
