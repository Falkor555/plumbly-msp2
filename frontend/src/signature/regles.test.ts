import { describe, expect, it } from 'vitest';
import { estTropLourde, raisonsDeBlocage, tailleDecodee, tronquerSansCouper } from './regles';

const PREFIXE = 'data:image/png;base64,';
const COMPLET = { compteRendu: 'Joint remplacé', nomSignataire: 'Jean Dupont', zoneVide: false };

describe('raisonsDeBlocage (RG31)', () => {
  it('ne bloque rien quand le compte rendu, le nom et le tracé sont là', () => {
    expect(raisonsDeBlocage(COMPLET)).toEqual([]);
  });

  it.each([
    ['la zone est vide', { zoneVide: true }, 'Faites signer le client dans le cadre.'],
    ['le compte rendu manque', { compteRendu: '' }, 'Saisissez le compte rendu.'],
    ['le compte rendu n’a que des espaces', { compteRendu: '   ' }, 'Saisissez le compte rendu.'],
    ['le nom manque', { nomSignataire: ' ' }, 'Indiquez le nom du signataire.'],
  ])('bloque quand %s', (_cas, modification, raison) => {
    expect(raisonsDeBlocage({ ...COMPLET, ...modification })).toEqual([raison]);
  });

  it('donne toutes les raisons, dans l’ordre de la fenêtre', () => {
    expect(raisonsDeBlocage({ compteRendu: '', nomSignataire: '', zoneVide: true })).toEqual([
      'Saisissez le compte rendu.',
      'Indiquez le nom du signataire.',
      'Faites signer le client dans le cadre.',
    ]);
  });
});

describe('tronquerSansCouper', () => {
  it('garde un texte assez court tel quel', () => {
    expect(tronquerSansCouper('Jean Dupont', 100)).toBe('Jean Dupont');
  });

  it('coupe au maximum compté comme le serveur (unités UTF-16)', () => {
    expect(tronquerSansCouper('a'.repeat(120), 100)).toHaveLength(100);
  });

  it('s’arrête avant un emoji qui dépasserait le maximum, plutôt que de le couper en deux', () => {
    expect(tronquerSansCouper(`${'a'.repeat(99)}😀`, 100)).toBe('a'.repeat(99));
    expect(tronquerSansCouper(`${'a'.repeat(98)}😀`, 100)).toBe(`${'a'.repeat(98)}😀`);
  });
});

describe('taille de l’image avant l’envoi (RG35)', () => {
  it.each([
    ['AAAA', 3],
    ['AAA=', 2],
    ['AA==', 1],
  ])('compte les octets de « %s » sans décoder', (base64, octets) => {
    expect(tailleDecodee(PREFIXE + base64)).toBe(octets);
  });

  it('accepte 49 152 octets et refuse 49 153', () => {
    // 49 152 octets = 65 536 caractères ; 49 153 octets = 65 540 caractères dont « == ».
    expect(estTropLourde(PREFIXE + 'A'.repeat(65_536))).toBe(false);
    expect(estTropLourde(`${PREFIXE}${'A'.repeat(65_538)}==`)).toBe(true);
  });
});
