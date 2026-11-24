import { choisirCouleur, PALETTE_PLANNING } from './regles-techniciens.js';

describe('choix de la couleur du planning', () => {
  it('prend la première couleur quand personne n’en utilise', () => {
    expect(choisirCouleur([])).toBe('#0F766E');
  });

  it('prend la première couleur de la palette encore libre, sans tenir compte de la casse', () => {
    expect(choisirCouleur(['#0f766e', '#1E88E5', '#7B1FA2'])).toBe('#AF4C00');
  });

  it('ignore les couleurs choisies hors de la palette', () => {
    expect(choisirCouleur(['#123456'])).toBe('#0F766E');
  });

  it('prend la couleur la moins utilisée quand toute la palette est prise', () => {
    const toutes = [...PALETTE_PLANNING, ...PALETTE_PLANNING.filter((c) => c !== '#2E7D32')];

    expect(choisirCouleur(toutes)).toBe('#2E7D32');
  });

  it('départage les ex aequo par l’ordre de la palette', () => {
    expect(choisirCouleur([...PALETTE_PLANNING])).toBe('#0F766E');
  });
});
