import { type ReactNode, type RefObject, useEffect, useRef } from 'react';

interface Props {
  /** Identifiant (useId) du titre de la fenêtre, qui la nomme pour les lecteurs d'écran. */
  idTitre: string;
  /** Identifiant du texte qui explique la fenêtre, lu avec son titre (confirmation). */
  idDescription?: string;
  onFermer: () => void;
  /** Élément qui reçoit le focus à l'ouverture, en général le bouton « Fermer ». */
  focusInitial: RefObject<HTMLElement | null>;
  /** Faux quand Échap ferait perdre une saisie : seul le bouton « Fermer » ferme alors. */
  fermableParEchap?: boolean;
  /** Vrai pour un contenu en deux colonnes (formulaire long, assistant) : la fenêtre s'élargit. */
  large?: boolean;
  children: ReactNode;
}

const OMBRE = 'shadow-[0_4px_6px_-1px_rgb(31_41_55/0.08),0_2px_4px_-2px_rgb(31_41_55/0.06)]';
const FOCALISABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Fenêtre modale accessible : voile, rôle dialog nommé par son titre, Échap pour fermer, Tab qui
 * reste dans la fenêtre et focus rendu à l'élément d'origine à la fermeture. Un clic sur le voile
 * ne ferme pas : une saisie en cours ne se perd pas par un geste involontaire. La fenêtre défile
 * quand elle dépasse la hauteur de l'écran (téléphone, clavier virtuel ouvert).
 */
export function Fenetre({
  idTitre,
  idDescription,
  onFermer,
  focusInitial,
  fermableParEchap = true,
  large = false,
  children,
}: Props) {
  const fenetre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Le focus revient à l'élément qui a ouvert la fenêtre, pour reprendre la lecture au même endroit.
    const elementDOrigine = document.activeElement;
    focusInitial.current?.focus();
    return () => {
      if (elementDOrigine instanceof HTMLElement) elementDOrigine.focus();
    };
  }, [focusInitial]);

  useEffect(() => {
    function gererClavier(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape' && fermableParEchap) onFermer();
      if (evenement.key === 'Tab' && fenetre.current) garderLeFocus(evenement, fenetre.current);
    }
    document.addEventListener('keydown', gererClavier);
    return () => document.removeEventListener('keydown', gererClavier);
  }, [onFermer, fermableParEchap]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-anthracite/40 p-4">
      <div
        ref={fenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={idDescription}
        // Repli du focus quand tous les contrôles sont désactivés (envoi en cours), hors tabulation.
        tabIndex={-1}
        className={`max-h-[calc(100dvh-2rem)] w-full ${large ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto rounded-xl border border-bordure bg-white focus:outline-none ${OMBRE}`}
      >
        {children}
      </div>
    </div>
  );
}

/** Tab sur le dernier élément revient au premier, Maj+Tab sur le premier va au dernier. */
function garderLeFocus(evenement: KeyboardEvent, fenetre: HTMLElement): void {
  const elements = [...fenetre.querySelectorAll<HTMLElement>(FOCALISABLES)];
  if (elements.length === 0) {
    // Pendant un envoi, tout est désactivé et le navigateur a renvoyé le focus sur le document :
    // sans cela, Tab atteindrait la page derrière le voile malgré aria-modal.
    evenement.preventDefault();
    fenetre.focus();
    return;
  }
  const premier = elements[0];
  const dernier = elements[elements.length - 1];
  const actif = document.activeElement;
  const horsDeLaFenetre = !fenetre.contains(actif);
  if (evenement.shiftKey && (actif === premier || horsDeLaFenetre)) {
    evenement.preventDefault();
    dernier.focus();
  } else if (!evenement.shiftKey && (actif === dernier || horsDeLaFenetre)) {
    evenement.preventDefault();
    premier.focus();
  }
}
