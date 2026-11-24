import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../commun/autorisation/roles.guard.js';
import {
  type UtilisateurConnecte,
  UtilisateurCourant,
} from '../commun/autorisation/utilisateur-connecte.js';
import { lireIdentifiant, type PageApi } from '../commun/validation.js';
import { InterventionsService } from './interventions.service.js';
import { type InterventionApi, TRIS_INTERVENTIONS } from './interventions.types.js';
import { lireFiltresInterventions, lireNouvelleIntervention } from './interventions.validation.js';

/** Objet Intervention du contrat d'API (section 6.3), pour les exemples Swagger. */
const EXEMPLE_INTERVENTION = {
  id: 42,
  description: 'Fuite sous l’évier de la cuisine',
  urgence: 'PRIORITAIRE',
  statut: 'PLANIFIEE',
  dureeEstimeeMin: 60,
  debutPrevu: '2026-11-25T08:00:00.000Z',
  finPrevue: '2026-11-25T09:00:00.000Z',
  enRetard: false,
  ordreTournee: 2,
  compteRendu: null,
  motifAnnulation: null,
  demarreeLe: null,
  termineeLe: null,
  annuleeLe: null,
  creeLe: '2026-11-24T09:12:00.000Z',
  majLe: '2026-11-24T09:30:00.000Z',
  type: { id: 1, libelle: 'Fuite' },
  adresse: {
    id: 15,
    rue: '12 rue des Lilas',
    complement: 'Bât. B',
    codePostal: '97400',
    ville: 'Saint-Denis',
    infosAcces: 'Code 4521, 3e étage',
  },
  client: { id: 8, typeClient: 'PARTICULIER', nomAffiche: 'Jean Dupont', telephone: '0692123456' },
  tournee: {
    id: 5,
    dateTournee: '2026-11-25',
    technicien: { id: 2, nom: 'Benali', prenom: 'Karim' },
  },
  createur: { id: 3, nom: 'Martin', prenom: 'Sophie' },
};

/**
 * Routes des interventions (contrat d'API, sections 5.3 et 6.3).
 * Couche HTTP seulement : validation des entrées, rôles, codes de retour. Le contrôle « technicien
 * affecté » demande de lire la tournée : il est fait dans le service.
 *
 * GET /interventions/:id/history est porté par le module journal (historique.controller.ts).
 */
@ApiTags('Interventions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Non connecté' })
@Controller('interventions')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'GESTIONNAIRE')
export class InterventionsController {
  constructor(private readonly service: InterventionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lister et filtrer les interventions (US15)',
    description:
      'Liste paginée ; filtres combinables. Par défaut, les plus urgentes d’abord, puis la plus ' +
      'ancienne demande (RG18). Droits : ADMIN, GESTIONNAIRE (un technicien passe par ' +
      'GET /tours/me/today).',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: '100 au plus', example: 20 })
  @ApiQuery({
    name: 'recherche',
    required: false,
    description: 'Description ou nom du client, sans tenir compte des accents ni de la casse',
    example: 'helene',
  })
  @ApiQuery({
    name: 'statut',
    required: false,
    description: 'Un ou plusieurs statuts séparés par des virgules',
    example: 'A_PLANIFIER,PLANIFIEE',
  })
  @ApiQuery({ name: 'urgence', required: false, enum: ['NORMALE', 'PRIORITAIRE', 'URGENTE'] })
  @ApiQuery({ name: 'technicienId', required: false, example: 2 })
  @ApiQuery({ name: 'clientId', required: false, example: 8 })
  @ApiQuery({
    name: 'du',
    required: false,
    description: 'Premier jour (AAAA-MM-JJ, La Réunion), sur le début prévu',
    example: '2026-11-23',
  })
  @ApiQuery({
    name: 'au',
    required: false,
    description: 'Dernier jour (AAAA-MM-JJ, La Réunion), sur le début prévu',
    example: '2026-11-28',
  })
  @ApiQuery({ name: 'tri', required: false, enum: TRIS_INTERVENTIONS })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [EXEMPLE_INTERVENTION],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Paramètre invalide ou inconnu' })
  @ApiForbiddenResponse({ description: 'Technicien' })
  lister(@Query() requete: Record<string, unknown>): Promise<PageApi<InterventionApi>> {
    return this.service.lister(lireFiltresInterventions(requete));
  }

  @Post()
  @ApiOperation({
    summary: 'Créer une intervention (US14)',
    description:
      'L’intervention est créée « à planifier » (RG01). Le client est déduit de l’adresse ; ' +
      'sans durée, celle du type est reprise. Droits : ADMIN, GESTIONNAIRE.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['adresseId', 'typeInterventionId', 'description', 'urgence'],
      properties: {
        adresseId: { type: 'integer', example: 15 },
        typeInterventionId: { type: 'integer', example: 1 },
        description: { type: 'string', maxLength: 1000, example: 'Fuite sous l’évier' },
        urgence: { type: 'string', enum: ['NORMALE', 'PRIORITAIRE', 'URGENTE'] },
        dureeEstimeeMin: { type: 'integer', minimum: 15, maximum: 720, example: 60 },
      },
    },
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        ...EXEMPLE_INTERVENTION,
        statut: 'A_PLANIFIER',
        debutPrevu: null,
        finPrevue: null,
        ordreTournee: null,
        tournee: null,
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Champ manquant ou invalide ; adresse ou type inexistant ; adresse ou client archivé',
  })
  @ApiForbiddenResponse({ description: 'Technicien' })
  creer(
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ): Promise<InterventionApi> {
    return this.service.creer(lireNouvelleIntervention(corps), utilisateur);
  }

  @Get(':id')
  @Roles('ADMIN', 'GESTIONNAIRE', 'TECHNICIEN')
  @ApiOperation({
    summary: 'Consulter une intervention (US14, US24)',
    description: 'Droits : ADMIN, GESTIONNAIRE, et le technicien de la tournée qui la contient.',
  })
  @ApiParam({ name: 'id', description: 'Identifiant de l’intervention', example: 42 })
  @ApiResponse({ status: 200, schema: { example: EXEMPLE_INTERVENTION } })
  @ApiForbiddenResponse({ description: 'Technicien qui n’est pas affecté à cette intervention' })
  @ApiNotFoundResponse({ description: 'Intervention inexistante' })
  consulter(
    @Param('id') id: string,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ): Promise<InterventionApi> {
    return this.service.consulter(lireIdentifiant(id), utilisateur);
  }
}
