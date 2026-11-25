/**
 * Classes Tailwind partagées par les écrans : une correction de contraste ou de focus se fait ici,
 * une seule fois.
 */

/** Lien de texte : sarcelle profonde soulignée (contraste 4,5:1 sur blanc), focus visible. */
export const LIEN =
  'text-sarcelle-profonde underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';

/** En-tête de colonne des tableaux de liste. */
export const ENTETE_TABLEAU =
  'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gris-texte';

/** Cellule des tableaux de liste. */
export const CELLULE_TABLEAU = 'px-3 py-2 text-sm';
