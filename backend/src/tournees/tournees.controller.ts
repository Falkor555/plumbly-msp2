import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../commun/autorisation/roles.guard.js';
import {
  type UtilisateurConnecte,
  UtilisateurCourant,
} from '../commun/autorisation/utilisateur-connecte.js';
import { lireIdentifiant } from '../commun/validation.js';
import { TourneesService } from './tournees.service.js';
import type { PlanningApi, TourneeApi } from './tournees.types.js';
import {
  lireAffectation,
  lireFiltresPlanning,
  lireNouvelleTournee,
  lireNouvelOrdre,
} from './tournees.validation.js';

/**
 * Routes des tournées et du planning (contrat d'API, section 5.7).
 * Couche HTTP seulement : validation des entrées, droits, codes de retour.
 */
@Controller('tours')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'GESTIONNAIRE')
export class TourneesController {
  constructor(private readonly service: TourneesService) {}

  /** US23 : planning sur une période (du, au) ; sans période, la semaine en cours. */
  @Get()
  consulterPlanning(@Query() requete: Record<string, unknown>): Promise<PlanningApi> {
    return this.service.consulterPlanning(
      lireFiltresPlanning(requete, this.service.semaineEnCours()),
    );
  }

  /** US24 : déclarée avant /:id, sinon « me » serait lu comme un identifiant. */
  @Get('me/today')
  @Roles('TECHNICIEN')
  async consulterMaTourneeDuJour(
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<TourneeApi | undefined> {
    const tournee = await this.service.consulterTourneeDuJour(utilisateur);
    if (tournee === null) {
      // Pas de tournée aujourd'hui : ce n'est pas une erreur, la réponse est simplement vide.
      reponse.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return tournee;
  }

  @Post()
  creerTournee(
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ): Promise<TourneeApi> {
    return this.service.creerTournee(lireNouvelleTournee(corps), utilisateur);
  }

  @Get(':id')
  consulterTournee(@Param('id') id: string): Promise<TourneeApi> {
    return this.service.consulterTournee(lireIdentifiant(id));
  }

  /** US21 : renvoie la tournée à jour (200, aucune ressource n'est créée). */
  @Post(':id/interventions')
  @HttpCode(HttpStatus.OK)
  affecterIntervention(
    @Param('id') id: string,
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ): Promise<TourneeApi> {
    return this.service.affecterIntervention(
      lireIdentifiant(id),
      lireAffectation(corps),
      utilisateur,
    );
  }

  @Delete(':id/interventions/:interventionId')
  retirerIntervention(
    @Param('id') id: string,
    @Param('interventionId') interventionId: string,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ): Promise<TourneeApi> {
    return this.service.retirerIntervention(
      lireIdentifiant(id),
      lireIdentifiant(interventionId),
      utilisateur,
    );
  }

  /** US22 */
  @Put(':id/order')
  reordonner(@Param('id') id: string, @Body() corps: unknown): Promise<TourneeApi> {
    return this.service.reordonner(lireIdentifiant(id), lireNouvelOrdre(corps));
  }
}
