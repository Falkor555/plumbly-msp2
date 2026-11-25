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
 * Contrôle des rôles, côté serveur, à chaque requête : masquer un bouton dans l'interface n'est
 * qu'un confort, la barrière de sécurité est ici.
 *
 * Il ne vérifie pas le jeton : AuthentificationGuard (APP_GUARD, #13) le fait avant lui et place
 * l'utilisateur dans request.user. Si request.user manque quand même (route @Public qui porterait
 * ce guard par erreur), il répond 401 : on refuse par défaut plutôt que d'ouvrir l'accès.
 * Le rôle ne suffit pas : le service vérifie aussi le droit sur la ressource (le technicien ne
 * touche qu'à ses interventions).
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
