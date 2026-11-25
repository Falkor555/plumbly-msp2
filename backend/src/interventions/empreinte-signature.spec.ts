import { calculerEmpreinte, type ContenuSigne } from './empreinte-signature.js';

const CONTENU: ContenuSigne = {
  idIntervention: 42,
  compteRendu: 'Joint du siphon remplacé, plus de fuite.',
  nomSignataire: 'Jean Dupont',
  signeeLe: new Date('2026-11-25T08:58:40.000Z'),
  idAuteur: 7,
  image: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
};

describe('calculerEmpreinte (RG34)', () => {
  it('renvoie 64 caractères hexadécimaux minuscules', () => {
    expect(calculerEmpreinte(CONTENU)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('donne la même empreinte pour le même contenu', () => {
    const copie: ContenuSigne = {
      ...CONTENU,
      signeeLe: new Date(CONTENU.signeeLe.getTime()),
      image: Uint8Array.from(CONTENU.image),
    };

    expect(calculerEmpreinte(copie)).toBe(calculerEmpreinte(CONTENU));
  });

  it('donne la même empreinte pour une image lue en Buffer ou en Uint8Array', () => {
    const avecBuffer: ContenuSigne = { ...CONTENU, image: Buffer.from(CONTENU.image) };

    expect(calculerEmpreinte(avecBuffer)).toBe(calculerEmpreinte(CONTENU));
  });

  it.each<[string, Partial<ContenuSigne>]>([
    ['l’intervention', { idIntervention: 43 }],
    ['le compte rendu', { compteRendu: 'Joint du siphon remplacé, plus de fuite' }],
    ['le nom du signataire', { nomSignataire: 'Jean Dupond' }],
    ['la date à la milliseconde près', { signeeLe: new Date('2026-11-25T08:58:40.001Z') }],
    ['l’auteur', { idAuteur: 8 }],
    ['un octet de l’image', { image: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 4]) }],
  ])('change si %s change', (_champ, modification) => {
    expect(calculerEmpreinte({ ...CONTENU, ...modification })).not.toBe(calculerEmpreinte(CONTENU));
  });

  it('distingue deux découpages du même texte entre compte rendu et nom', () => {
    const premier = { ...CONTENU, compteRendu: 'ab', nomSignataire: 'c' };
    const second = { ...CONTENU, compteRendu: 'a', nomSignataire: 'bc' };

    expect(calculerEmpreinte(premier)).not.toBe(calculerEmpreinte(second));
  });
});
