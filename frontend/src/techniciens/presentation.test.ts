import { describe, expect, it } from 'vitest';
import { initiales, libelleDuCompte, nombreDeTechniciens } from './presentation';

describe('présentation des techniciens', () => {
  it.each([
    [0, '0 technicien'],
    [1, '1 technicien'],
    [2, '2 techniciens'],
  ])('US11 : compte %d technicien(s) en « %s »', (nombre, attendu) => {
    expect(nombreDeTechniciens(nombre)).toBe(attendu);
  });

  it('US11 : prend les initiales du prénom puis du nom, en capitales, accents compris', () => {
    expect(initiales({ prenom: 'Émile', nom: 'Nativel' })).toBe('ÉN');
    expect(initiales({ prenom: 'jean', nom: 'rivière' })).toBe('JR');
  });

  it('US11 : nomme un compte par son prénom, son nom et son e-mail, qui départage deux homonymes', () => {
    expect(
      libelleDuCompte({ prenom: 'Julie', nom: 'Roche', email: 'julie.roche@plumbly.re' }),
    ).toBe('Julie Roche — julie.roche@plumbly.re');
  });
});
