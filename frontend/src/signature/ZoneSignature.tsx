import {
  type PointerEvent as EvenementPointeur,
  type Ref,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { HAUTEUR_CANVAS, LARGEUR_CANVAS, type Point, versCoordonneesCanvas } from './coordonnees';

/** Couleur anthracite de la charte et épaisseur lisible même réduite à 360 px de large. */
const COULEUR_TRAIT = '#27313F';
const EPAISSEUR_TRAIT = 3.5;

/** Ce que la fenêtre de clôture peut demander à la zone. */
export interface PoigneeZoneSignature {
  /** Image PNG du tracé, sur fond transparent. Appelée à la validation seulement. */
  exporterPng: () => string;
}

interface Props {
  /** Vrai dès le premier trait, faux après « Effacer ». */
  onChangement: (dessinee: boolean) => void;
  /** Pendant l'envoi : le tracé ne change plus. */
  desactivee?: boolean;
  ref?: Ref<PoigneeZoneSignature>;
}

/**
 * US33 : le client signe au doigt, au stylet ou à la souris (Pointer Events). Un seul pointeur
 * trace à la fois : un deuxième doigt posé pendant le tracé est ignoré. Le tracé reste dans le
 * canvas, en mémoire : rien n'est écrit dans le stockage du navigateur.
 *
 * On ne signe pas au clavier : l'alternative accessible est « Terminer sans signature ».
 */
export function ZoneSignature({ onChangement, desactivee = false, ref }: Props) {
  const idConsigne = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointeurActif = useRef<number | null>(null);
  const dernierPoint = useRef<Point | null>(null);
  const [dessinee, setDessinee] = useState(false);

  useImperativeHandle(ref, () => ({
    exporterPng: () => canvas.current?.toDataURL('image/png') ?? '',
  }));

  function pinceau(): CanvasRenderingContext2D | null {
    const contexte = canvas.current?.getContext('2d') ?? null;
    if (contexte) {
      contexte.strokeStyle = COULEUR_TRAIT;
      contexte.fillStyle = COULEUR_TRAIT;
      contexte.lineWidth = EPAISSEUR_TRAIT;
      contexte.lineCap = 'round';
      contexte.lineJoin = 'round';
    }
    return contexte;
  }

  function pointDe(evenement: EvenementPointeur<HTMLCanvasElement>): Point {
    return versCoordonneesCanvas(evenement, evenement.currentTarget.getBoundingClientRect());
  }

  function commencerTrait(evenement: EvenementPointeur<HTMLCanvasElement>) {
    if (desactivee || pointeurActif.current !== null) return;
    evenement.preventDefault();
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    pointeurActif.current = evenement.pointerId;
    const point = pointDe(evenement);
    dernierPoint.current = point;
    // Un simple appui laisse un point, comme un stylo posé sur le papier.
    const contexte = pinceau();
    contexte?.beginPath();
    contexte?.arc(point.x, point.y, EPAISSEUR_TRAIT / 2, 0, 2 * Math.PI);
    contexte?.fill();
    if (!dessinee) {
      setDessinee(true);
      onChangement(true);
    }
  }

  function prolongerTrait(evenement: EvenementPointeur<HTMLCanvasElement>) {
    if (evenement.pointerId !== pointeurActif.current || dernierPoint.current === null) return;
    const point = pointDe(evenement);
    const contexte = pinceau();
    contexte?.beginPath();
    contexte?.moveTo(dernierPoint.current.x, dernierPoint.current.y);
    contexte?.lineTo(point.x, point.y);
    contexte?.stroke();
    dernierPoint.current = point;
  }

  /** pointerup, ou pointercancel quand le système reprend le geste (appel, notification). */
  function finirTrait(evenement: EvenementPointeur<HTMLCanvasElement>) {
    if (evenement.pointerId !== pointeurActif.current) return;
    pointeurActif.current = null;
    dernierPoint.current = null;
  }

  function effacer() {
    pinceau()?.clearRect(0, 0, LARGEUR_CANVAS, HAUTEUR_CANVAS);
    pointeurActif.current = null;
    dernierPoint.current = null;
    setDessinee(false);
    onChangement(false);
  }

  return (
    <div>
      <p id={idConsigne} className="mb-2 text-sm font-medium">
        Le client signe dans le cadre, avec le doigt ou un stylet.
      </p>
      <div className="relative rounded border border-gray-300 bg-white">
        <canvas
          ref={canvas}
          width={LARGEUR_CANVAS}
          height={HAUTEUR_CANVAS}
          role="img"
          aria-label="Zone de signature du client"
          aria-describedby={idConsigne}
          onPointerDown={commencerTrait}
          onPointerMove={prolongerTrait}
          onPointerUp={finirTrait}
          onPointerCancel={finirTrait}
          className="block aspect-[3/1] w-full cursor-crosshair touch-none select-none"
        />
        {/* Ligne de signature, décorative : elle n'apparaît pas dans l'image exportée. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-6 bottom-[22%] left-6 border-b border-dashed border-gray-300"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-xs text-gris-texte">
          {dessinee ? 'Signature tracée.' : 'Zone vide.'}
        </p>
        <button
          type="button"
          onClick={effacer}
          disabled={!dessinee || desactivee}
          className="h-11 rounded border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}
