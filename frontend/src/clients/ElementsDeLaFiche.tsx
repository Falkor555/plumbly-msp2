import { type ReactNode, type Ref, useId } from 'react';
import { BOUTON_DESTRUCTIF, BOUTON_SECONDAIRE, LIEN } from '../commun/classes';
import type { ActionFiche } from './FenetreDeLaFiche';

/* Briques communes à l'en-tête et aux sections de la fiche client (US09, US10). */

/** Lien de la fiche : celui du texte, en gras pour se détacher des valeurs affichées. */
export const LIEN_FICHE = `${LIEN} font-semibold`;

const CARTE = 'rounded-lg border border-bordure bg-white';

/** Actions d'un client en service ; absentes pour un client archivé. */
export interface ActionsDeLaFiche {
  ouvrir: (action: ActionFiche) => void;
  /**
   * Vrai pendant la relecture qui suit une écriture : la fiche affichée est périmée (adresse déjà
   * archivée, client déjà archivé) et une nouvelle action serait refusée par l'API.
   */
  inactives: boolean;
}

interface PropsSection {
  titre: string;
  /** Bouton d'action placé à droite du titre. */
  action?: ReactNode;
  /** Posé avec tabIndex={-1} : le titre peut alors recevoir le focus. */
  refTitre?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}

/** Section titrée de la fiche (pas d'onglets) : elle est nommée par son titre de niveau 2. */
export function Section({ titre, action, refTitre, children }: PropsSection) {
  const idTitre = useId();
  return (
    <section aria-labelledby={idTitre} className={CARTE}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordure px-4 py-3">
        <h2
          ref={refTitre}
          id={idTitre}
          tabIndex={refTitre ? -1 : undefined}
          className="text-lg font-semibold focus:outline-none"
        >
          {titre}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

interface PropsBouton {
  actions: ActionsDeLaFiche;
  /** Fenêtre que le bouton ouvre. */
  action: ActionFiche;
  destructif?: boolean;
  /** Raison propre au bouton de rester inactif (RG21), en plus d'une relecture en cours. */
  inactif?: boolean;
  /** Explication lue avec le bouton inactif. */
  idExplication?: string;
  children: ReactNode;
}

/**
 * Bouton d'action de la fiche. Inactif, il reste focalisable (aria-disabled) et n'ouvre rien : le
 * focus rendu par une fenêtre qui se ferme n'est ainsi jamais perdu pendant la relecture.
 */
export function BoutonDeLaFiche({
  actions,
  action,
  destructif = false,
  inactif = false,
  idExplication,
  children,
}: PropsBouton) {
  const desactive = inactif || actions.inactives;
  return (
    <button
      type="button"
      aria-disabled={desactive || undefined}
      aria-describedby={idExplication}
      onClick={() => {
        if (!desactive) actions.ouvrir(action);
      }}
      className={destructif ? BOUTON_DESTRUCTIF : BOUTON_SECONDAIRE}
    >
      {children}
    </button>
  );
}
