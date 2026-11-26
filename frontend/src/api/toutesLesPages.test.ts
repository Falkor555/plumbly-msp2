import { describe, expect, it, vi } from 'vitest';
import { lireToutesLesPages } from './toutesLesPages';
import type { ListePaginee } from './types';

/** Page « numero » d'une liste de « total » nombres, découpée par « limit ». */
function page(numero: number, limit: number, total: number): ListePaginee<number> {
  const debut = (numero - 1) * limit;
  const data = Array.from(
    { length: Math.max(Math.min(limit, total - debut), 0) },
    (_, rang) => debut + rang,
  );
  return { data, meta: { page: numero, limit, total, totalPages: Math.ceil(total / limit) } };
}

describe('lecture de toutes les pages d’une liste', () => {
  it('US11 : une liste d’une seule page n’est lue qu’une fois, par 100', async () => {
    const lirePage = vi.fn((numero: number, limit: number) =>
      Promise.resolve(page(numero, limit, 42)),
    );

    const elements = await lireToutesLesPages(lirePage);

    expect(elements).toHaveLength(42);
    expect(lirePage.mock.calls).toEqual([[1, 100]]);
  });

  it('US11 : lit les pages suivantes dans l’ordre et met bout à bout leurs éléments', async () => {
    const lirePage = vi.fn((numero: number, limit: number) =>
      Promise.resolve(page(numero, limit, 250)),
    );

    const elements = await lireToutesLesPages(lirePage);

    expect(elements).toEqual(Array.from({ length: 250 }, (_, rang) => rang));
    expect(lirePage.mock.calls).toEqual([
      [1, 100],
      [2, 100],
      [3, 100],
    ]);
  });

  it('US11 : une liste vide (totalPages à 0) ne demande pas d’autre page', async () => {
    const lirePage = vi.fn((numero: number, limit: number) =>
      Promise.resolve(page(numero, limit, 0)),
    );

    expect(await lireToutesLesPages(lirePage)).toEqual([]);
    expect(lirePage).toHaveBeenCalledTimes(1);
  });

  it('US11 : l’échec d’une page suivante fait échouer toute la lecture', async () => {
    const panne = new Error('page 2 illisible');
    const lirePage = vi.fn((numero: number, limit: number) =>
      numero === 2 ? Promise.reject(panne) : Promise.resolve(page(numero, limit, 250)),
    );

    await expect(lireToutesLesPages(lirePage)).rejects.toBe(panne);
    expect(lirePage).toHaveBeenCalledTimes(2);
  });
});
