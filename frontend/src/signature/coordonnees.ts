/*
 * Le canvas a une taille interne fixe (600 × 200) mais s'affiche sur toute la largeur de
 * l'écran : un point touché à l'écran doit être ramené à l'échelle du canvas.
 */

export const LARGEUR_CANVAS = 600;
export const HAUTEUR_CANVAS = 200;

export interface Point {
  x: number;
  y: number;
}

type Cadre = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

/**
 * Point du canvas qui correspond à une position à l'écran (clientX, clientY), d'après le cadre
 * affiché du canvas (getBoundingClientRect). Le point est ramené dans le canvas : avec la capture
 * du pointeur, le doigt peut sortir du cadre sans interrompre le trait.
 */
export function versCoordonneesCanvas(
  position: { clientX: number; clientY: number },
  cadre: Cadre,
): Point {
  if (cadre.width <= 0 || cadre.height <= 0) return { x: 0, y: 0 };
  return {
    x: borner(((position.clientX - cadre.left) * LARGEUR_CANVAS) / cadre.width, LARGEUR_CANVAS),
    y: borner(((position.clientY - cadre.top) * HAUTEUR_CANVAS) / cadre.height, HAUTEUR_CANVAS),
  };
}

function borner(valeur: number, maximum: number): number {
  return Math.min(Math.max(valeur, 0), maximum);
}
