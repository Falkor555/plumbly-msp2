import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { RequeteAuthentifiee } from '../commun/autorisation/utilisateur-connecte.js';
import { Role } from '../generated/prisma/client.ts';
import type { ContenuJetonAcces } from './jetons.js';
import { CLE_PUBLIC } from './public.decorator.js';

const PREFIXE_BEARER = 'Bearer ';
const ROLES_EXISTANTS = new Set<string>(Object.values(Role));

/**
 * Authentification, sur toutes les routes (enregistré comme APP_GUARD) : vérifie le jeton
 * d'accès et place l'utilisateur dans request.user. Le RolesGuard contrôle ensuite les droits.
 * Un jeton absent, expiré, falsifié ou au contenu inattendu donne le même 401 :
 * aucun indice n'est donné, et le front réagit de la même façon (rafraîchissement).
 */
@Injectable()
export class AuthentificationGuard implements CanActivate {
  constructor(
    private readonly reflecteur: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const estPublique = this.reflecteur.getAllAndOverride<boolean | undefined>(CLE_PUBLIC, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);
    if (estPublique === true) {
      return true;
    }
    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const contenu = await this.lireJetonAcces(requete.headers.authorization);
    requete.user = { id: contenu.sub, role: contenu.role };
    return true;
  }

  private async lireJetonAcces(entete: string | undefined): Promise<ContenuJetonAcces> {
    if (entete?.startsWith(PREFIXE_BEARER) === true) {
      try {
        // L'algorithme accepté est fixé dans le module (HS256) : un jeton qui annonce « none »
        // ou un autre algorithme est refusé, quoi qu'il contienne.
        const contenu = await this.jwt.verifyAsync<Record<string, unknown>>(
          entete.slice(PREFIXE_BEARER.length),
        );
        if (estUnContenuValide(contenu)) {
          return contenu;
        }
      } catch {
        // Jeton expiré, mal signé ou illisible : même réponse que sans jeton.
      }
    }
    throw new UnauthorizedException('Authentification requise.');
  }
}

function estUnContenuValide(
  contenu: Record<string, unknown>,
): contenu is Record<string, unknown> & ContenuJetonAcces {
  return (
    Number.isInteger(contenu.sub) &&
    (contenu.sub as number) >= 1 &&
    typeof contenu.role === 'string' &&
    ROLES_EXISTANTS.has(contenu.role)
  );
}
