import { CleInterdite, verifierClesSures } from './cles-mongodb.js';

const DATE = new Date('2026-12-08T05:03:12.000Z');

describe('verifierClesSures', () => {
  it('accepte un document du journal ordinaire', () => {
    const document = {
      date: DATE,
      action: 'STATUT_MODIFIE',
      auteur: { id: 7, role: 'TECHNICIEN' },
      entite: { type: 'intervention', id: 42 },
      avant: { statut: 'PLANIFIEE' },
      apres: { statut: 'EN_COURS' },
      contexte: { motif: 'Texte avec $ et . dans la valeur : seules les clés comptent.' },
    };

    expect(() => verifierClesSures(document)).not.toThrow();
  });

  it.each([
    ['avant', { avant: { $ne: 0 } }, 'document.avant.$ne'],
    ['apres', { apres: { 'statut.ancien': 'PLANIFIEE' } }, 'document.apres.statut.ancien'],
    ['contexte', { contexte: { $where: 'sleep(1000)' } }, 'document.contexte.$where'],
  ])('refuse une clé interdite dans %s', (_champ, document, chemin) => {
    expect(() => verifierClesSures(document)).toThrow(new CleInterdite(chemin));
  });

  it('refuse une clé interdite imbriquée sur plusieurs niveaux', () => {
    const document = { contexte: { appareil: { reseau: { $gt: '' } } } };

    expect(() => verifierClesSures(document)).toThrow(/document\.contexte\.appareil\.reseau\.\$gt/);
  });

  it('refuse une clé interdite dans un objet placé dans un tableau', () => {
    const document = { apres: { etapes: [{ ok: true }, { 'a.b': 1 }] } };

    expect(() => verifierClesSures(document)).toThrow(/document\.apres\.etapes\[1\]\.a\.b/);
  });

  it('refuse une clé interdite à la racine', () => {
    expect(() => verifierClesSures({ $set: { statut: 'TERMINEE' } })).toThrow(CleInterdite);
  });

  it('accepte les valeurs nulles, les dates et les tableaux de scalaires', () => {
    expect(() => verifierClesSures({ a: null, b: DATE, c: [1, 'deux', false] })).not.toThrow();
  });
});
