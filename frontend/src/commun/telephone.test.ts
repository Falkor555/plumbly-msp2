import { describe, expect, it } from 'vitest';
import { normaliserTelephone, telephoneLisible } from './telephone';

describe('normalisation du téléphone', () => {
  it('US06 : retire les espaces et les points, comme l’API', () => {
    expect(normaliserTelephone('06.92 12.34 56')).toBe('0692123456');
    expect(normaliserTelephone('0692-12-34-56')).toBeNull();
  });
});

describe('présentation du téléphone', () => {
  it.each([
    ['0692123456', '0692 12 34 56'],
    ['0262414243', '0262 41 42 43'],
    ['069212345', '069212345'],
    ['+262692123456', '+262692123456'],
    ['', ''],
  ])('US08 : écrit le téléphone %s sous la forme « %s »', (telephone, attendu) => {
    expect(telephoneLisible(telephone)).toBe(attendu);
  });
});
