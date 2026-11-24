import { dansLOrdreDe, echapperMotif } from './outils-de-recherche.js';

describe('outils de recherche', () => {
  it('rétablit l’ordre de la requête SQL dans les lignes chargées par Prisma', () => {
    const lignes = [{ id: 3 }, { id: 1 }, { id: 2 }];

    expect(dansLOrdreDe([2, 3, 1], lignes)).toEqual([{ id: 2 }, { id: 3 }, { id: 1 }]);
  });

  it('ignore un identifiant dont la ligne a disparu entre les deux requêtes', () => {
    expect(dansLOrdreDe([2, 9, 1], [{ id: 1 }, { id: 2 }])).toEqual([{ id: 2 }, { id: 1 }]);
  });

  it('neutralise les jokers de LIKE saisis dans la recherche', () => {
    expect(echapperMotif('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    expect(echapperMotif("' OR 1=1 --")).toBe("' OR 1=1 --");
  });
});
