import { type ReactNode, type Ref, useId } from 'react';
import { BOUTON_DESTRUCTIF, BOUTON_SECONDAIRE, LIEN } from './classes';

/* Briques communes à l'en-tête et aux sections des fiches client et technicien (US09 à US11). */

/** Lien de la fiche : celui du texte, en gras pour se détacher des valeurs affichées. */
export const LIEN_FICHE = `${LIEN} font-semibold`;

const CARTE = 'rounded-lg border border-bordure bg-white';

/**
 * Actions d'une fiche en service ; absentes pour une fiche archivée. A : les fenêtres que la fiche
 * peut ouvrir (ActionFiche pour un client, ActionFicheTechnicien pour un technicien).
 */
export interface ActionsDeLaFiche<A> {
  ouvrir: (action: A) => void;
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

export function Rubrique({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gris-texte">{titre}</dt>
      <dd>{children}</dd>
    </div>
  );
}

interface PropsBouton<A> {
  actions: ActionsDeLaFiche<A>;
  /** Fenêtre que le bouton ouvre. */
  action: A;
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
export function BoutonDeLaFiche<A>({
  actions,
  action,
  destructif = false,
  inactif = false,
  idExplication,
  children,
}: PropsBouton<A>) {
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
