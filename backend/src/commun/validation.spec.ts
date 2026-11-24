import { BadRequestException } from '@nestjs/common';
import { estUneDate, lireIdentifiant } from './validation.js';

describe('lireIdentifiant', () => {
  it('lit un identifiant écrit en chiffres', () => {
    expect(lireIdentifiant('42')).toBe(42);
  });

  it.each([
    ['vide', ''],
    ['zéro', '0'],
    ['négatif', '-1'],
    ['décimal', '1.5'],
    ['en notation scientifique', '1e3'],
    ['hexadécimal', '0x1F'],
    ['entouré d’espaces', ' 12 '],
    ['au-delà d’un integer PostgreSQL', '2147483648'],
    ['suivi de SQL', '1 OR 1=1'],
  ])('refuse un identifiant %s', (_cas, texte) => {
    expect(() => lireIdentifiant(texte)).toThrow(BadRequestException);
  });
});

describe('estUneDate', () => {
  it('accepte un jour du calendrier et refuse le 30 février', () => {
    expect(estUneDate('2028-02-29')).toBe(true);
    expect(estUneDate('2026-02-30')).toBe(false);
  });
});
