import { type ReactNode, type RefObject, useEffect } from 'react';

interface Props {
  /** Identifiant (useId) du titre de la fenêtre, qui la nomme pour les lecteurs d'écran. */
  idTitre: string;
  onFermer: () => void;
  /** Élément qui reçoit le focus à l'ouverture, en général le bouton « Fermer ». */
  focusInitial: RefObject<HTMLElement | null>;
  /** Faux quand Échap ferait perdre une saisie : seul le bouton « Fermer » ferme alors. */
  fermableParEchap?: boolean;
  /** Largeur et hauteur de la fenêtre (classes Tailwind). */
  className?: string;
  children: ReactNode;
}

const OMBRE = 'shadow-[0_4px_6px_-1px_rgb(31_41_55/0.08),0_2px_4px_-2px_rgb(31_41_55/0.06)]';

/**
 * Fenêtre modale accessible : voile, rôle dialog nommé par son titre, Échap pour fermer et focus
 * rendu à l'élément d'origine à la fermeture. Un clic sur le voile ne ferme pas : une saisie en
 * cours ne se perd pas par un geste involontaire.
 */
export function Fenetre({
  idTitre,
  onFermer,
  focusInitial,
  fermableParEchap = true,
  className = 'max-w-lg',
  children,
}: Props) {
  useEffect(() => {
    // Le focus revient à l'élément qui a ouvert la fenêtre, pour reprendre la lecture au même endroit.
    const elementDOrigine = document.activeElement;
    focusInitial.current?.focus();
    return () => {
      if (elementDOrigine instanceof HTMLElement) elementDOrigine.focus();
    };
  }, [focusInitial]);

  useEffect(() => {
    if (!fermableParEchap) return undefined;
    function fermerAvecEchap(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape') onFermer();
    }
    document.addEventListener('keydown', fermerAvecEchap);
    return () => document.removeEventListener('keydown', fermerAvecEchap);
  }, [onFermer, fermableParEchap]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-anthracite/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        className={`w-full rounded-xl border border-bordure bg-white ${OMBRE} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
