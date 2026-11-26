import { type TexteLisible, texteLisibleSur } from '../commun/contraste';
import { couleurTechnicien } from '../planning/presentation';

const CLASSES_TEXTE: Record<TexteLisible, string> = { noir: 'text-black', blanc: 'text-white' };

interface Props {
  /** Couleur de planning de la fiche ; une valeur qui n'est pas #RRGGBB prend la sarcelle. */
  couleur: string;
  /** Initiales écrites sur la pastille ; sans texte, la pastille n'est qu'un point. */
  texte?: string;
}

/**
 * Pastille de la couleur du planning d'un technicien (US11), toujours posée à côté d'un libellé
 * écrit (son nom, ou la valeur de la couleur) : elle est décorative et masquée aux lecteurs
 * d'écran. Cette couleur est une donnée métier, choisie librement : c'est la seule appliquée en
 * style, hors des jetons de la charte. Le texte posé dessus est noir ou blanc, celui des deux qui
 * contraste le plus : sur n'importe quel fond, l'un des deux dépasse 4,5:1 (RGAA 3.2).
 */
export function PastilleCouleur({ couleur, texte }: Props) {
  const fond = couleurTechnicien(couleur);
  if (texte === undefined) {
    return (
      <span
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: fond }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${CLASSES_TEXTE[texteLisibleSur(fond)]}`}
      style={{ backgroundColor: fond }}
    >
      {texte}
    </span>
  );
}
