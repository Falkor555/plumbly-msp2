import { describe, expect, it } from 'vitest';
import { REGLES_MOT_DE_PASSE, respecteLaPolitique } from './reglesMotDePasse';

describe('politique de mot de passe (affichage)', () => {
  it('accepte un mot de passe conforme', () => {
    expect(respecteLaPolitique('Plombier#2026!')).toBe(true);
  });

  it('indique chaque règle non respectée', () => {
    const nonRespectees = REGLES_MOT_DE_PASSE.filter((regle) => !regle.estRespectee('abc'));
    expect(nonRespectees.map((regle) => regle.libelle)).toEqual([
      'Au moins 12 caractères',
      'Une majuscule',
      'Un chiffre',
      'Un caractère spécial',
    ]);
  });

  it('refuse plus de 128 caractères, comme l’API', () => {
    expect(respecteLaPolitique(`Aa1!${'x'.repeat(130)}`)).toBe(false);
  });
});
