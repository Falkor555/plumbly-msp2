import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../commun/autorisation/roles.guard.js';
import { lireIdentifiant } from '../commun/validation.js';
import { TypesInterventionService } from './types-intervention.service.js';
import type { TypeInterventionApi } from './types-intervention.types.js';
import { lireModificationType, lireNouveauType } from './types-intervention.validation.js';

const EXEMPLE_TYPE = { id: 1, libelle: 'Fuite', dureeDefautMin: 60 };

const CORPS_TYPE = {
  type: 'object',
  properties: {
    libelle: { type: 'string', maxLength: 100, example: 'Fuite' },
    dureeDefautMin: { type: 'integer', minimum: 15, maximum: 720, example: 60 },
  },
} as const;

/**
 * Routes des types d'intervention (contrat d'API, sections 5.4 et 6.4).
 * Couche HTTP seulement : validation des entrées, droits, codes de retour.
 */
@ApiTags('Types d’intervention')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Non connecté' })
@Controller('intervention-types')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class TypesInterventionController {
  constructor(private readonly service: TypesInterventionService) {}

  /** US14 : la liste et les durées par défaut servent au formulaire de création. */
  @Get()
  @Roles('ADMIN', 'GESTIONNAIRE', 'TECHNICIEN')
  @ApiOperation({
    summary: 'Lister les types d’intervention (US14)',
    description:
      'Tous les types, triés par libellé (liste courte, non paginée). Droits : connecté.',
  })
  @ApiResponse({ status: 200, schema: { example: [EXEMPLE_TYPE] } })
  lister(): Promise<TypeInterventionApi[]> {
    return this.service.lister();
  }

  @Post()
  @ApiOperation({ summary: 'Créer un type d’intervention (US14)', description: 'Droits : ADMIN.' })
  @ApiBody({ schema: { ...CORPS_TYPE, required: ['libelle', 'dureeDefautMin'] } })
  @ApiResponse({ status: 201, schema: { example: EXEMPLE_TYPE } })
  @ApiBadRequestResponse({ description: 'Champ manquant ou invalide, champ inconnu' })
  @ApiForbiddenResponse({ description: 'Rôle autre qu’ADMIN' })
  @ApiConflictResponse({ description: 'Libellé déjà utilisé' })
  creer(@Body() corps: unknown): Promise<TypeInterventionApi> {
    return this.service.creer(lireNouveauType(corps));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier un type d’intervention (US14)',
    description:
      'Champs facultatifs, au moins un. Modifier la durée par défaut ne change pas les ' +
      'interventions déjà créées. Droits : ADMIN.',
  })
  @ApiParam({ name: 'id', description: 'Identifiant du type', example: 1 })
  @ApiBody({ schema: CORPS_TYPE })
  @ApiResponse({ status: 200, schema: { example: EXEMPLE_TYPE } })
  @ApiBadRequestResponse({ description: 'Champ invalide, champ inconnu ou aucun champ' })
  @ApiForbiddenResponse({ description: 'Rôle autre qu’ADMIN' })
  @ApiNotFoundResponse({ description: 'Type inexistant' })
  @ApiConflictResponse({ description: 'Libellé déjà utilisé' })
  modifier(@Param('id') id: string, @Body() corps: unknown): Promise<TypeInterventionApi> {
    return this.service.modifier(lireIdentifiant(id), lireModificationType(corps));
  }
}
