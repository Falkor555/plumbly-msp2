import { useCallback, useRef, type RefObject } from 'react';

export interface Reessai<T extends HTMLElement> {
  /** À poser, avec tabIndex={-1}, sur un bloc qui reste affiché pendant la nouvelle lecture. */
  zoneDeRepli: RefObject<T | null>;
  reessayer: () => void;
}

/**
 * « Réessayer » relance la lecture : l'alerte, et donc le bouton qui a le focus, laisse place au
 * chargement. Sans repli, le navigateur rendrait le focus au document et l'utilisateur au clavier
 * devrait retraverser toute la page (RGAA 12.8). Le focus passe donc d'abord sur un bloc stable,
 * qui contient ensuite la liste relue.
 */
export function useReessai<T extends HTMLElement>(recharger: () => void): Reessai<T> {
  const zoneDeRepli = useRef<T>(null);
  const reessayer = useCallback(() => {
    zoneDeRepli.current?.focus();
    recharger();
  }, [recharger]);
  return { zoneDeRepli, reessayer };
}
