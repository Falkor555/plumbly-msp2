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

/** Même gabarit que les badges du planning (BadgesIntervention). */
export const BADGE =
  'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset';

/** Gris neutre, comme une intervention annulée : la fiche n'est plus active mais reste lisible. */
export const CLASSES_ARCHIVE = 'bg-gray-100 text-gris-texte ring-bordure';

/** Champ de recherche ou menu d'une barre de filtres, à la hauteur des boutons (h-9). */
export const CHAMP_DE_FILTRE =
  'mt-1 block h-9 rounded border border-gray-300 bg-white px-2 text-sm focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none';

/** Champ de saisie ou liste déroulante d'un formulaire, bordé de rouge quand il est refusé. */
export const CHAMP_DE_SAISIE =
  'mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none disabled:bg-gray-50 aria-invalid:border-erreur';

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
