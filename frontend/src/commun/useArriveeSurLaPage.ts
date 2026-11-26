import { type RefObject, useLayoutEffect } from 'react';

/**
 * Une page ouverte par un lien de l'application (Link) ne recharge pas le document : le lien
 * activé disparaît avec l'ancienne page, le focus retombe sur le document sans que rien ne soit
 * annoncé, et le défilement de l'ancienne page est conservé (RGAA 12, WCAG 2.4.3). Comme après un
 * chargement complet, la page repart donc du haut ; sa zone principale, posée avec tabIndex={-1},
 * reçoit le focus pour que la lecture et la tabulation reprennent au début du contenu. Au premier
 * affichage, cela revient à un lien d'évitement déjà suivi. Agir avant que le navigateur ne peigne
 * évite d'afficher un instant la nouvelle page à la hauteur de l'ancienne.
 */
export function useArriveeSurLaPage(zonePrincipale: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    zonePrincipale.current?.focus();
  }, [zonePrincipale]);
}
