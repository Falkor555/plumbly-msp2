import { describe, expect, it } from 'vitest';
import {
  CONTRASTE_MINIMAL_TEXTE,
  luminanceRelative,
  rapportDeContraste,
  texteLisibleSur,
} from './contraste';

describe('rapport de contraste WCAG 2.1', () => {
  it('RGAA 3.2 : donne 21:1 entre le noir et le blanc, dans un sens comme dans l’autre', () => {
    expect(rapportDeContraste('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(rapportDeContraste('#ffffff', '#000000')).toBeCloseTo(21, 10);
  });

  it('RGAA 3.2 : donne 1:1 entre deux couleurs identiques', () => {
    expect(rapportDeContraste('#0f766e', '#0f766e')).toBe(1);
  });

  it('RGAA 3.2 : lit les chiffres hexadécimaux en majuscules comme en minuscules', () => {
    expect(rapportDeContraste('#0F766E', '#FFFFFF')).toBe(rapportDeContraste('#0f766e', '#ffffff'));
  });

  it('RGAA 3.2 : refuse le rouge d’erreur d’origine sur son fond clair (sous 4,5:1)', () => {
    const rapport = rapportDeContraste('#dc2626', '#fef2f2');

    expect(rapport).toBeLessThan(CONTRASTE_MINIMAL_TEXTE);
    expect(rapport).toBeCloseTo(4.41, 2);
  });

  it('RGAA 3.2 : accepte le rouge de texte de la charte sur le même fond (4,5:1 ou plus)', () => {
    const rapport = rapportDeContraste('#b91c1c', '#fef2f2');

    expect(rapport).toBeGreaterThanOrEqual(CONTRASTE_MINIMAL_TEXTE);
    expect(rapport).toBeCloseTo(5.91, 2);
  });
});

describe('luminance relative', () => {
  it('RGAA 3.2 : vaut 0 pour le noir et 1 pour le blanc', () => {
    expect(luminanceRelative('#000000')).toBe(0);
    expect(luminanceRelative('#ffffff')).toBeCloseTo(1, 10);
  });

  it('RGAA 3.2 : pondère le vert plus que le rouge, et le rouge plus que le bleu', () => {
    const [rouge, vert, bleu] = ['#ff0000', '#00ff00', '#0000ff'].map(luminanceRelative);

    expect(rouge).toBeCloseTo(0.2126, 4);
    expect(vert).toBeCloseTo(0.7152, 4);
    expect(bleu).toBeCloseTo(0.0722, 4);
  });

  it.each(['#fff', 'ffffff', '#ffffff00', '#gggggg', ' #ffffff', ''])(
    'RGAA 3.2 : refuse « %s », qui n’est pas au format #RRGGBB',
    (couleur) => {
      expect(() => luminanceRelative(couleur)).toThrow(RangeError);
      expect(() => rapportDeContraste(couleur, '#000000')).toThrow('format #RRGGBB attendu');
      expect(() => texteLisibleSur(couleur)).toThrow(RangeError);
    },
  );
});

describe('texte lisible sur une couleur de planning', () => {
  it('RGAA 3.2 : écrit en noir sur un jaune clair', () => {
    expect(texteLisibleSur('#fef08a')).toBe('noir');
  });

  it('RGAA 3.2 : écrit en blanc sur un bleu foncé', () => {
    expect(texteLisibleSur('#1e3a8a')).toBe('blanc');
  });

  it('RGAA 3.2 : écrit en blanc sur les couleurs de démonstration des techniciens', () => {
    expect(['#0F766E', '#AF4C00', '#4F46E5'].map(texteLisibleSur)).toEqual([
      'blanc',
      'blanc',
      'blanc',
    ]);
  });

  it('RGAA 3.2 : bascule entre noir et blanc au gris moyen, là où les deux contrastes se croisent', () => {
    // #767676 : 4,54:1 avec le blanc, 4,62:1 avec le noir ; #757575 : 4,61:1 et 4,56:1.
    expect(texteLisibleSur('#767676')).toBe('noir');
    expect(texteLisibleSur('#757575')).toBe('blanc');
  });

  it('RGAA 3.2 : écrit en noir sur le blanc et en blanc sur le noir', () => {
    expect(texteLisibleSur('#ffffff')).toBe('noir');
    expect(texteLisibleSur('#000000')).toBe('blanc');
  });
});
