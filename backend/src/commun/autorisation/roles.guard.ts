import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/client.ts';
import { CLE_ROLES } from './roles.decorator.js';
import type { RequeteAuthentifiee } from './utilisateur-connecte.js';

/**
 * Contrôle des rôles, côté serveur, à chaque requête.
 *
 * Il ne vérifie pas le jeton : l'authentification (card #13) le fait avant lui et place
 * l'utilisateur dans request.user. Tant qu'elle n'existe pas, request.user est vide et toutes
 * les routes protégées répondent 401 : on refuse par défaut plutôt que d'ouvrir l'accès.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflecteur: Reflector) {}

  canActivate(contexte: ExecutionContext): boolean {
    const rolesAutorises = this.reflecteur.getAllAndOverride<Role[] | undefined>(CLE_ROLES, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);
    const { user } = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    if (user === undefined) {
      throw new UnauthorizedException('Authentification requise.');
    }
    // Une route sans @Roles reste fermée : un oubli de décorateur ne doit pas ouvrir l'accès.
    if (rolesAutorises === undefined || !rolesAutorises.includes(user.role)) {
      throw new ForbiddenException('Accès refusé.');
    }
    return true;
  }
}
