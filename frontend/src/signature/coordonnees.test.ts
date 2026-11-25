import { describe, expect, it } from 'vitest';
import { versCoordonneesCanvas } from './coordonnees';

// Canvas de 600 × 200 affiché sur 300 × 100 px, à 20 px du bord gauche et 50 px du haut.
const CADRE = { left: 20, top: 50, width: 300, height: 100 };

describe('versCoordonneesCanvas', () => {
  it('ramène un point de l’écran à l’échelle du canvas', () => {
    expect(versCoordonneesCanvas({ clientX: 170, clientY: 100 }, CADRE)).toEqual({
      x: 300,
      y: 100,
    });
  });

  it('place les coins du cadre aux coins du canvas', () => {
    expect(versCoordonneesCanvas({ clientX: 20, clientY: 50 }, CADRE)).toEqual({ x: 0, y: 0 });
    expect(versCoordonneesCanvas({ clientX: 320, clientY: 150 }, CADRE)).toEqual({
      x: 600,
      y: 200,
    });
  });

  it('tient compte d’un affichage plus large que le canvas (1 200 px)', () => {
    const large = { left: 0, top: 0, width: 1200, height: 400 };

    expect(versCoordonneesCanvas({ clientX: 600, clientY: 100 }, large)).toEqual({ x: 300, y: 50 });
  });

  it('garde dans le canvas un doigt sorti du cadre pendant le tracé', () => {
    expect(versCoordonneesCanvas({ clientX: -40, clientY: 400 }, CADRE)).toEqual({ x: 0, y: 200 });
  });

  it('renvoie l’origine pour un cadre sans taille (zone pas encore affichée)', () => {
    const vide = { left: 0, top: 0, width: 0, height: 0 };

    expect(versCoordonneesCanvas({ clientX: 10, clientY: 10 }, vide)).toEqual({ x: 0, y: 0 });
  });
});
