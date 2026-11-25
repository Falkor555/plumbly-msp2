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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../commun/autorisation/roles.guard.js';
import {
  type UtilisateurConnecte,
  UtilisateurCourant,
} from '../commun/autorisation/utilisateur-connecte.js';
import { lireIdentifiant, type PageApi } from '../commun/validation.js';
import { UtilisateursService } from './utilisateurs.service.js';
import type { CompteCree, UtilisateurApi } from './utilisateurs.types.js';
import {
  lireChangementMotDePasse,
  lireFiltresUtilisateurs,
  lireModificationProfil,
  lireModificationUtilisateur,
  lireNouvelUtilisateur,
} from './utilisateurs.validation.js';

const SCHEMA_COMPTE = {
  type: 'object',
  properties: {
    email: { type: 'string', example: 'julie.roche@plumbly.test' },
    nom: { type: 'string', example: 'Roche' },
    prenom: { type: 'string', example: 'Julie' },
    role: { type: 'string', enum: ['ADMIN', 'GESTIONNAIRE', 'TECHNICIEN'], example: 'TECHNICIEN' },
  },
};

/**
 * Routes des comptes utilisateurs (contrat d'API, sections 5.2 et 6.2).
 * Les routes /me sont déclarées avant /:id, sinon « me » serait lu comme un identifiant.
 * Elles identifient l'utilisateur par son jeton, jamais par un identifiant dans l'URL :
 * impossible de viser le compte d'un autre en changeant un nombre (IDOR).
 */
@ApiTags('Utilisateurs')
@ApiBearerAuth()
@Controller('users')
@UseGuards(RolesGuard)
export class UtilisateursController {
  constructor(private readonly service: UtilisateursService) {}

  // ---------- Son propre compte ----------

  @Get('me')
  @Roles('ADMIN', 'GESTIONNAIRE', 'TECHNICIEN')
  @ApiOperation({ summary: 'Consulter son profil (US01, US05)' })
  consulterMonProfil(
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ): Promise<UtilisateurApi> {
    return this.service.consulterMonProfil(utilisateur.id);
  }

  @Patch('me')
  @Roles('ADMIN', 'GESTIONNAIRE', 'TECHNICIEN')
  @ApiOperation({
    summary: 'Modifier son profil (US05)',
    description: 'Nom et prénom uniquement : l’e-mail et le rôle relèvent de l’administrateur.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', example: 'Martin' },
        prenom: { type: 'string', example: 'Sophie' },
      },
    },
  })
  modifierMonProfil(
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
    @Body() corps: unknown,
  ): Promise<UtilisateurApi> {
    return this.service.modifierMonProfil(utilisateur.id, lireModificationProfil(corps));
  }

  @Patch('me/password')
  @Roles('ADMIN', 'GESTIONNAIRE', 'TECHNICIEN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Changer son mot de passe (US03, US05)',
    description:
      'Exige l’ancien mot de passe. Coupe toutes les sessions, la session en cours comprise : ' +
      'l’utilisateur se reconnecte avec son nouveau mot de passe.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['ancienMotDePasse', 'nouveauMotDePasse'],
      properties: {
        ancienMotDePasse: { type: 'string' },
        nouveauMotDePasse: {
          type: 'string',
          description:
            '12 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial',
        },
      },
    },
  })
  async changerMonMotDePasse(
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
    @Body() corps: unknown,
  ): Promise<void> {
    await this.service.changerMonMotDePasse(utilisateur.id, lireChangementMotDePasse(corps));
  }

  // ---------- Administration des comptes (US03) ----------

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Lister les comptes (US03)', description: 'Droits : ADMIN.' })
  @ApiQuery({ name: 'recherche', required: false, description: 'Nom, prénom ou e-mail' })
  @ApiQuery({ name: 'role', required: false, enum: ['ADMIN', 'GESTIONNAIRE', 'TECHNICIEN'] })
  @ApiQuery({ name: 'actif', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'tri', required: false, enum: ['nom', '-nom'] })
  lister(@Query() requete: Record<string, unknown>): Promise<PageApi<UtilisateurApi>> {
    return this.service.lister(lireFiltresUtilisateurs(requete));
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Créer un compte (US03)',
    description:
      'Le mot de passe provisoire est généré par le serveur et renvoyé une seule fois. ' +
      'Erreur 409 si l’e-mail est déjà utilisé. Droits : ADMIN.',
  })
  @ApiBody({ schema: { ...SCHEMA_COMPTE, required: ['email', 'nom', 'prenom', 'role'] } })
  creer(@Body() corps: unknown): Promise<CompteCree> {
    return this.service.creer(lireNouvelUtilisateur(corps));
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Consulter un compte (US03)', description: 'Droits : ADMIN.' })
  consulter(@Param('id') id: string): Promise<UtilisateurApi> {
    return this.service.consulter(lireIdentifiant(id));
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Modifier un compte (US03)',
    description:
      'Un administrateur ne peut pas retirer son propre rôle (400). Le rôle d’un technicien ' +
      'qui a une fiche technicien ne peut pas changer (409). Droits : ADMIN.',
  })
  @ApiBody({ schema: SCHEMA_COMPTE })
  modifier(
    @Param('id') id: string,
    @Body() corps: unknown,
    @UtilisateurCourant() auteur: UtilisateurConnecte,
  ): Promise<UtilisateurApi> {
    return this.service.modifier(lireIdentifiant(id), lireModificationUtilisateur(corps), auteur);
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Désactiver un compte (US03)',
    description:
      'Coupe toutes ses sessions. Un administrateur ne peut pas désactiver son propre compte. Droits : ADMIN.',
  })
  desactiver(
    @Param('id') id: string,
    @UtilisateurCourant() auteur: UtilisateurConnecte,
  ): Promise<UtilisateurApi> {
    return this.service.desactiver(lireIdentifiant(id), auteur);
  }

  @Post(':id/activate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réactiver un compte (US03)', description: 'Droits : ADMIN.' })
  activer(@Param('id') id: string): Promise<UtilisateurApi> {
    return this.service.activer(lireIdentifiant(id));
  }
}
