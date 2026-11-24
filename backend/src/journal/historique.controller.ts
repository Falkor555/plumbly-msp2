import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../commun/autorisation/roles.guard.js';
import { lireIdentifiant } from '../commun/validation.js';
import { type EntreeHistoriqueApi, HistoriqueService } from './historique.service.js';

/**
 * Historique des statuts d'une intervention (US19), lu dans le journal MongoDB.
 *
 * Porté par le module journal en attendant le module interventions (#17) : ce contrôleur ne
 * déclare que cette route ; #17 peut le garder tel quel ou déplacer la route dans le sien.
 */
@ApiTags('Interventions')
@ApiBearerAuth()
@Controller('interventions')
@UseGuards(RolesGuard)
@Roles('ADMIN', 'GESTIONNAIRE')
export class HistoriqueController {
  constructor(private readonly service: HistoriqueService) {}

  @Get(':id/history')
  @ApiOperation({
    summary: 'Historique des statuts d’une intervention (US19)',
    description:
      'Entrées du journal des actions, de la plus récente à la plus ancienne (100 au plus). ' +
      'Droits : ADMIN, GESTIONNAIRE.',
  })
  @ApiParam({ name: 'id', description: 'Identifiant de l’intervention', example: 42 })
  @ApiResponse({
    status: 200,
    description: 'Historique de l’intervention',
    schema: {
      example: [
        {
          date: '2026-11-25T08:03:12.000Z',
          action: 'STATUT_MODIFIE',
          auteur: { id: 7, nom: 'Benali', prenom: 'Karim', role: 'TECHNICIEN' },
          avant: { statut: 'PLANIFIEE' },
          apres: { statut: 'EN_COURS' },
        },
      ],
    },
  })
  @ApiServiceUnavailableResponse({ description: 'Journal des actions (MongoDB) injoignable' })
  historique(@Param('id') id: string): Promise<EntreeHistoriqueApi[]> {
    return this.service.historiqueDeLIntervention(lireIdentifiant(id));
  }
}
