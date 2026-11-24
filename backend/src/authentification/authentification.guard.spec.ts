import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { RequeteAuthentifiee } from '../commun/autorisation/utilisateur-connecte.js';
import { AuthentificationGuard } from './authentification.guard.js';

const SECRET = 'secret-des-tests-unitaires-de-32-caracteres-au-moins';
const jwt = new JwtService({
  secret: SECRET,
  signOptions: { algorithm: 'HS256', expiresIn: 900 },
  verifyOptions: { algorithms: ['HS256'] },
});

function contexte(requete: Partial<RequeteAuthentifiee>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => requete }),
  } as unknown as ExecutionContext;
}

function guard(routePublique = false): AuthentificationGuard {
  const reflecteur = { getAllAndOverride: () => routePublique } as unknown as Reflector;
  return new AuthentificationGuard(reflecteur, jwt);
}

function requeteAvec(entete?: string): Partial<RequeteAuthentifiee> {
  return { headers: entete === undefined ? {} : { authorization: entete } };
}

describe('AuthentificationGuard', () => {
  it('laisse passer une route publique sans jeton', async () => {
    await expect(guard(true).canActivate(contexte(requeteAvec()))).resolves.toBe(true);
  });

  it('place l’utilisateur dans request.user pour un jeton valide', async () => {
    const requete = requeteAvec(`Bearer ${await jwt.signAsync({ sub: 7, role: 'TECHNICIEN' })}`);
    await expect(guard().canActivate(contexte(requete))).resolves.toBe(true);
    expect(requete.user).toEqual({ id: 7, role: 'TECHNICIEN' });
  });

  it('refuse une requête sans jeton', async () => {
    await expect(guard().canActivate(contexte(requeteAvec()))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuse un en-tête qui n’est pas de type Bearer', async () => {
    await expect(guard().canActivate(contexte(requeteAvec('Basic abc')))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuse un jeton signé avec un autre secret', async () => {
    const autre = new JwtService({ secret: 'un-autre-secret-de-32-caracteres-au-moins!' });
    const jeton = await autre.signAsync({ sub: 1, role: 'ADMIN' });
    await expect(guard().canActivate(contexte(requeteAvec(`Bearer ${jeton}`)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuse un jeton expiré', async () => {
    const jeton = await jwt.signAsync({ sub: 1, role: 'ADMIN' }, { expiresIn: -10 });
    await expect(guard().canActivate(contexte(requeteAvec(`Bearer ${jeton}`)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuse un jeton non signé (algorithme « none »)', async () => {
    const enBase64 = (objet: object): string =>
      Buffer.from(JSON.stringify(objet)).toString('base64url');
    const jeton = `${enBase64({ alg: 'none', typ: 'JWT' })}.${enBase64({ sub: 1, role: 'ADMIN' })}.`;
    await expect(guard().canActivate(contexte(requeteAvec(`Bearer ${jeton}`)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuse un jeton bien signé au rôle inconnu', async () => {
    const jeton = await jwt.signAsync({ sub: 1, role: 'SUPER_ADMIN' });
    await expect(guard().canActivate(contexte(requeteAvec(`Bearer ${jeton}`)))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
