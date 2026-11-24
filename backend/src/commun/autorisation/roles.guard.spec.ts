import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/client.ts';
import { RolesGuard } from './roles.guard.js';
import type { UtilisateurConnecte } from './utilisateur-connecte.js';

function contexteAvec(
  utilisateur: UtilisateurConnecte | undefined,
  roles: Role[] | undefined,
): { garde: RolesGuard; contexte: ExecutionContext } {
  const reflecteur = { getAllAndOverride: vi.fn().mockReturnValue(roles) } as unknown as Reflector;
  const contexte = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user: utilisateur }) }),
  } as unknown as ExecutionContext;
  return { garde: new RolesGuard(reflecteur), contexte };
}

describe('RolesGuard', () => {
  it('laisse passer un utilisateur dont le rôle est autorisé', () => {
    const { garde, contexte } = contexteAvec({ id: 1, role: 'GESTIONNAIRE' }, [
      'ADMIN',
      'GESTIONNAIRE',
    ]);

    const autorise = garde.canActivate(contexte);

    expect(autorise).toBe(true);
  });

  it('répond 401 quand personne n’est authentifié', () => {
    const { garde, contexte } = contexteAvec(undefined, ['ADMIN']);

    expect(() => garde.canActivate(contexte)).toThrow(UnauthorizedException);
  });

  it('répond 403 quand le rôle n’est pas autorisé', () => {
    const { garde, contexte } = contexteAvec({ id: 7, role: 'TECHNICIEN' }, [
      'ADMIN',
      'GESTIONNAIRE',
    ]);

    expect(() => garde.canActivate(contexte)).toThrow(ForbiddenException);
  });

  it('refuse l’accès à une route qui n’a déclaré aucun rôle', () => {
    const { garde, contexte } = contexteAvec({ id: 1, role: 'ADMIN' }, undefined);

    expect(() => garde.canActivate(contexte)).toThrow(ForbiddenException);
  });
});
