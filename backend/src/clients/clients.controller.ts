import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  type StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProduces } from '@nestjs/swagger';
import { Roles } from '../commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../commun/autorisation/roles.guard.js';
import {
  type UtilisateurConnecte,
  UtilisateurCourant,
} from '../commun/autorisation/utilisateur-connecte.js';
import { versReponseCsv } from '../commun/csv/fichier-csv.js';
import { lireIdentifiant, type PageApi } from '../commun/validation.js';
import type { InterventionApi } from '../interventions/interventions.types.js';
import { ClientsService } from './clients.service.js';
import type { AdresseApi, ClientApi } from './clients.types.js';
import {
  lireCriteresExportClients,
  lireFiltresClients,
  lireFiltresHistorique,
  lireModificationAdresse,
  lireModificationClient,
  lireNouveauClient,
  lireNouvelleAdresse,
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

  /**
   * US32. Déclarée avant GET :id : sinon « export » serait lu comme un identifiant (400).
   * no-store : le fichier contient des données personnelles, il ne reste dans aucun cache.
   */
  @Get('export')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporter en CSV la liste filtrée des clients (US32)',
    description:
      'Mêmes filtres et même tri que GET /clients, sans page ni limit. Une ligne par adresse ' +
      'non archivée ; UTF-8 avec BOM, « ; », CRLF, formules neutralisées (RG26) ; 5 000 lignes ' +
      'au plus. Journal EXPORT_CSV (RG25). Droits : ADMIN, GESTIONNAIRE.',
  })
  @ApiProduces('text/csv')
  async exporter(
    @Query() requete: Record<string, unknown>,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ): Promise<StreamableFile> {
    const criteres = lireCriteresExportClients(requete);
    // Les clés ont été validées par lireCriteresExportClients : ce sont des noms connus.
    const fichier = await this.service.exporter(criteres, utilisateur, Object.keys(requete));
    return versReponseCsv(fichier);
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

  /** US07 */
  @Post(':id/addresses')
  ajouterAdresse(@Param('id') id: string, @Body() corps: unknown): Promise<AdresseApi> {
    return this.service.ajouterAdresse(lireIdentifiant(id), lireNouvelleAdresse(corps));
  }

  /** US07 */
  @Patch(':id/addresses/:addressId')
  modifierAdresse(
    @Param('id') id: string,
    @Param('addressId') idAdresse: string,
    @Body() corps: unknown,
  ): Promise<AdresseApi> {
    return this.service.modifierAdresse(
      lireIdentifiant(id),
      lireIdentifiant(idAdresse),
      lireModificationAdresse(corps),
    );
  }

  /** US07 et RG21 : renvoie l'adresse archivée (200). */
  @Post(':id/addresses/:addressId/archive')
  @HttpCode(HttpStatus.OK)
  archiverAdresse(
    @Param('id') id: string,
    @Param('addressId') idAdresse: string,
  ): Promise<AdresseApi> {
    return this.service.archiverAdresse(lireIdentifiant(id), lireIdentifiant(idAdresse));
  }
}
