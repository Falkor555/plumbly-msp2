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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
 *
 * Les décorateurs @Api… alimentent la documentation Swagger (/api/docs). Les corps de requête y
 * sont décrits à la main : la validation est écrite en fonctions (tournees.validation.ts), sans
 * classes DTO dont Swagger pourrait tirer le schéma.
 */
@ApiTags('Tournées et planning')
@ApiBearerAuth()
@Controller('tours')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'GESTIONNAIRE')
export class TourneesController {
  constructor(private readonly service: TourneesService) {}

  /** US23 : planning sur une période (du, au) ; sans période, la semaine en cours. */
  @Get()
  @ApiOperation({
    summary: 'Planning des techniciens sur une période (US23)',
    description:
      'Tous les techniciens actifs, avec leurs tournées et indisponibilités. ' +
      'Sans période : la semaine en cours, du lundi au samedi. Droits : ADMIN, GESTIONNAIRE.',
  })
  @ApiQuery({
    name: 'du',
    required: false,
    description: 'Premier jour (AAAA-MM-JJ), avec « au »',
    example: '2026-11-23',
  })
  @ApiQuery({
    name: 'au',
    required: false,
    description: 'Dernier jour (AAAA-MM-JJ), 31 jours au plus',
    example: '2026-11-28',
  })
  @ApiQuery({
    name: 'technicienId',
    required: false,
    description: 'Un seul technicien',
    example: 2,
  })
  consulterPlanning(@Query() requete: Record<string, unknown>): Promise<PlanningApi> {
    return this.service.consulterPlanning(
      lireFiltresPlanning(requete, this.service.semaineEnCours()),
    );
  }

  /** US24 : déclarée avant /:id, sinon « me » serait lu comme un identifiant. */
  @Get('me/today')
  @Roles('TECHNICIEN')
  @ApiOperation({
    summary: 'Ma tournée du jour (US24)',
    description:
      'Le technicien est identifié par son jeton. Réponse 204 sans contenu s’il n’a pas de ' +
      'tournée aujourd’hui. Droits : TECHNICIEN.',
  })
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
  @ApiOperation({
    summary: 'Créer la tournée d’un technicien pour une date (US20)',
    description: 'Erreur 409 si le technicien a déjà une tournée ce jour-là (RG08).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['technicienId', 'dateTournee'],
      properties: {
        technicienId: { type: 'integer', example: 2 },
        dateTournee: { type: 'string', format: 'date', example: '2026-11-25' },
      },
    },
  })
  creerTournee(
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ): Promise<TourneeApi> {
    return this.service.creerTournee(lireNouvelleTournee(corps), utilisateur);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulter une tournée et ses interventions (US23)' })
  consulterTournee(@Param('id') id: string): Promise<TourneeApi> {
    return this.service.consulterTournee(lireIdentifiant(id));
  }

  /** US21 : renvoie la tournée à jour (200, aucune ressource n'est créée). */
  @Post(':id/interventions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Affecter une intervention sur un créneau (US21)',
    description:
      'L’intervention passe à « planifiée ». Erreur 409 en cas de chevauchement (RG09) ou ' +
      'd’indisponibilité du technicien (RG10). Renvoie la tournée à jour.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['interventionId', 'debutPrevu'],
      properties: {
        interventionId: { type: 'integer', example: 42 },
        debutPrevu: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 avec fuseau obligatoire',
          example: '2026-11-25T08:00:00+04:00',
        },
        ordreTournee: {
          type: 'integer',
          description: 'Rang dans la tournée ; par défaut, en dernier',
          example: 1,
        },
      },
    },
  })
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
  @ApiOperation({
    summary: 'Retirer une intervention de la tournée (US21)',
    description: 'L’intervention revient à « à planifier » (RG04). Renvoie la tournée à jour.',
  })
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
  @ApiOperation({
    summary: 'Réordonner les interventions de la tournée (US22)',
    description:
      'Toutes les interventions de la tournée, dans le nouvel ordre, dans une transaction ' +
      '(RG14). Une intervention en cours ou terminée ne peut pas changer de place.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['interventionIds'],
      properties: {
        interventionIds: { type: 'array', items: { type: 'integer' }, example: [43, 42, 44] },
      },
    },
  })
  reordonner(@Param('id') id: string, @Body() corps: unknown): Promise<TourneeApi> {
    return this.service.reordonner(lireIdentifiant(id), lireNouvelOrdre(corps));
  }
}
