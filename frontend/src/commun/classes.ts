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

const FOCUS_VISIBLE =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';
// aria-disabled garde le bouton focalisable, pour que son explication reste lisible au clavier.
const INACTIF =
  'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

/** Action principale d'un écran ou d'une fenêtre. */
export const BOUTON_PRINCIPAL = `h-9 rounded bg-sarcelle px-4 text-sm font-semibold text-white hover:bg-sarcelle-profonde ${FOCUS_VISIBLE} ${INACTIF}`;

/** Action secondaire (Annuler, Modifier) : bordée, sur fond blanc. */
export const BOUTON_SECONDAIRE = `h-9 rounded border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-100 ${FOCUS_VISIBLE} ${INACTIF}`;

/**
 * Action destructive sur une page (archiver) : bordée et en rouge foncé, pour ne pas rivaliser avec
 * l'action principale. Elle ouvre toujours une confirmation.
 */
export const BOUTON_DESTRUCTIF = `h-9 rounded border border-erreur/40 bg-white px-4 text-sm font-semibold text-erreur-texte hover:bg-erreur-fond ${FOCUS_VISIBLE} ${INACTIF}`;

/** Confirmation d'une action destructive, dans sa fenêtre : bouton plein (6,5:1). */
export const BOUTON_DESTRUCTIF_PLEIN = `h-9 rounded bg-erreur-texte px-4 text-sm font-semibold text-white hover:underline ${FOCUS_VISIBLE} ${INACTIF}`;
