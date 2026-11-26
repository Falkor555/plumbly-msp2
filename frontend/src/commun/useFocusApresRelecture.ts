import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Focus à poser une fois la fiche relue. Après un archivage, le bouton qui avait ouvert la fenêtre
 * disparaît avec la relecture : sans cela, le focus retomberait sur le document et l'utilisateur
 * au clavier devrait retraverser la page (RGAA 12.8). La cible est un titre resté en place.
 * `ficheRelue` est la fiche affichée : chaque relecture en donne un nouvel objet.
 */
export function useFocusApresRelecture(
  ficheRelue: unknown,
): (cible: RefObject<HTMLElement | null>) => void {
  const cibleEnAttente = useRef<RefObject<HTMLElement | null> | null>(null);
  // Effet de mise en page : le focus change dans la mise à jour même qui retire le bouton. Un
  // effet ordinaire ne passerait qu'après l'affichage, laissant un moment le focus au document.
  useLayoutEffect(() => {
    // La fiche relue est un nouvel objet : l'effet ne passe qu'une fois la relecture arrivée.
    cibleEnAttente.current?.current?.focus();
    cibleEnAttente.current = null;
  }, [ficheRelue]);
  return useCallback((cible) => {
    cibleEnAttente.current = cible;
  }, []);
}
