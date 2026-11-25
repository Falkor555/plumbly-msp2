import { describe, expect, it } from 'vitest';
import { lireIdentifiant } from './identifiant';

describe('identifiant lu dans l’adresse de la page', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['2147483647', 2_147_483_647],
  ])('US09 : lit « %s » comme l’identifiant %d', (segment, attendu) => {
    expect(lireIdentifiant(segment)).toBe(attendu);
  });

  it.each([
    ['vide', ''],
    ['zéro', '0'],
    ['zéro de tête', '007'],
    ['négatif', '-3'],
    ['lettres', 'abc'],
    ['décimal', '1.5'],
    ['notation scientifique', '1e3'],
    ['hexadécimal', '0x1F'],
    ['espaces autour', ' 12 '],
    ['au-delà d’un entier PostgreSQL', '2147483648'],
    ['très long', '99999999999999999999'],
  ])('US09 : refuse un identifiant %s', (_cas, segment) => {
    expect(lireIdentifiant(segment)).toBeNull();
  });
});
