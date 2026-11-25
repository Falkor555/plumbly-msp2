import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthentificationService } from './authentification.service.js';
import type { ReponseConnexion, ReponseRafraichissement } from './authentification.types.js';
import { lireConnexion } from './authentification.validation.js';
import { DUREE_JETON_RAFRAICHISSEMENT_MS } from './jetons.js';
import { Public } from './public.decorator.js';

const COOKIE_RAFRAICHISSEMENT = 'refresh_token';

/**
 * httpOnly : illisible par le JavaScript de la page (vol par XSS impossible).
 * secure : HTTPS seulement (les navigateurs acceptent aussi http://localhost).
 * sameSite strict : jamais envoyé depuis un autre site (protection CSRF).
 * path : envoyé aux seules routes d'authentification, pas à chaque requête.
 */
const OPTIONS_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

/**
 * Routes d'authentification (contrat d'API, sections 5.1 et 6.1).
 * Couche HTTP seulement : lecture du corps et du cookie, codes de retour.
 */
@ApiTags('Authentification')
@Controller('auth')
export class AuthentificationController {
  constructor(private readonly service: AuthentificationService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Limite fixée dans le module : 5 tentatives par adresse IP en 15 minutes, puis 429.
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Se connecter (US01)',
    description:
      'Renvoie le jeton d’accès et pose le cookie de rafraîchissement. Même erreur 401 pour un ' +
      'e-mail inconnu, un mot de passe faux ou un compte désactivé. 429 après 5 tentatives en 15 minutes.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'motDePasse'],
      properties: {
        email: { type: 'string', example: 'sophie.martin@plomberie-durand.fr' },
        motDePasse: { type: 'string', example: 'Plombier#2026!' },
      },
    },
  })
  async connecter(
    @Body() corps: unknown,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<ReponseConnexion> {
    const session = await this.service.connecter(lireConnexion(corps));
    poserCookie(reponse, session.jetonRafraichissement);
    return session.reponse;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renouveler le jeton d’accès',
    description: 'Lit le cookie de rafraîchissement, le remplace par un nouveau (rotation).',
  })
  async rafraichir(
    @Req() requete: Request,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<ReponseRafraichissement> {
    const session = await this.service.rafraichir(lireCookie(requete));
    poserCookie(reponse, session.jetonRafraichissement);
    return session.reponse;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Se déconnecter (US02)',
    description: 'Révoque la session et vide le cookie.',
  })
  async deconnecter(
    @Req() requete: Request,
    @Res({ passthrough: true }) reponse: Response,
  ): Promise<void> {
    await this.service.deconnecter(lireCookie(requete));
    reponse.clearCookie(COOKIE_RAFRAICHISSEMENT, OPTIONS_COOKIE);
  }
}

function lireCookie(requete: Request): string | undefined {
  const cookies = requete.cookies as Record<string, unknown> | undefined;
  const valeur = cookies?.[COOKIE_RAFRAICHISSEMENT];
  return typeof valeur === 'string' ? valeur : undefined;
}

function poserCookie(reponse: Response, jeton: string): void {
  reponse.cookie(COOKIE_RAFRAICHISSEMENT, jeton, {
    ...OPTIONS_COOKIE,
    maxAge: DUREE_JETON_RAFRAICHISSEMENT_MS,
  });
}
