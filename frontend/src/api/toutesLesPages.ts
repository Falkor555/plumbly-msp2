import { TAILLE_PAGE_MAX } from './parametres';
import type { ListePaginee } from './types';

/**
 * Tous les éléments d'une liste paginée de l'API, lue par pages de 100 (le maximum accepté), pour
 * un écran qui doit l'avoir en entier : un compte absent d'une première page tronquée passerait
 * pour inexistant. Les pages suivantes ne sont demandées que si la première annonce qu'il y en a,
 * l'une après l'autre.
 */
export async function lireToutesLesPages<T>(
  lirePage: (page: number, limit: number) => Promise<ListePaginee<T>>,
): Promise<T[]> {
  const premiere = await lirePage(1, TAILLE_PAGE_MAX);
  const elements = [...premiere.data];
  for (let page = 2; page <= premiere.meta.totalPages; page += 1) {
    const suivante = await lirePage(page, TAILLE_PAGE_MAX);
    elements.push(...suivante.data);
  }
  return elements;
}
