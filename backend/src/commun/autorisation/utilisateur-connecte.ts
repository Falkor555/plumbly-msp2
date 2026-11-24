import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client.ts';

/**
 * Utilisateur authentifié, tel que la stratégie JWT de la card #13 le place dans request.user.
 * Seuls l'identifiant et le rôle sont nécessaires aux contrôles d'accès.
 */
export interface UtilisateurConnecte {
  id: number;
  role: Role;
}

export type RequeteAuthentifiee = Request & { user?: UtilisateurConnecte };

/** Paramètre de contrôleur : l'utilisateur connecté (garanti par RolesGuard). */
export const UtilisateurCourant = createParamDecorator(
  (_donnees: unknown, contexte: ExecutionContext): UtilisateurConnecte | undefined =>
    contexte.switchToHttp().getRequest<RequeteAuthentifiee>().user,
);
