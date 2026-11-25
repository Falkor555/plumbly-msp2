import { BadRequestException } from '@nestjs/common';
import { lireConnexion } from './authentification.validation.js';

describe('lecture de POST /auth/login', () => {
  it('met l’e-mail en minuscules et garde le mot de passe intact', () => {
    expect(
      lireConnexion({ email: 'Sophie.Martin@Plomberie-Durand.fr', motDePasse: ' Plombier#2026! ' }),
    ).toEqual({ email: 'sophie.martin@plomberie-durand.fr', motDePasse: ' Plombier#2026! ' });
  });

  it('refuse un champ inconnu', () => {
    expect(() => lireConnexion({ email: 'a@b.fr', motDePasse: 'x', role: 'ADMIN' })).toThrow(
      new BadRequestException(['Le champ role n’est pas autorisé']),
    );
  });

  it('signale tous les champs manquants en une fois', () => {
    expect(() => lireConnexion({})).toThrow(
      new BadRequestException(['email est obligatoire', 'motDePasse est obligatoire']),
    );
  });

  it('refuse un e-mail mal formé', () => {
    expect(() => lireConnexion({ email: 'pas-un-email', motDePasse: 'x' })).toThrow(
      BadRequestException,
    );
  });
});
