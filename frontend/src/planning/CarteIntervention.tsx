import type { Intervention } from '../api/types';
import { BadgesIntervention } from './BadgesIntervention';
import { creneau } from './presentation';

interface Props {
  intervention: Intervention;
  couleur: string;
  onOuvrir: (intervention: Intervention) => void;
}

/** Résumé d'une intervention dans une case du planning ; un clic ouvre son détail (US23). */
export function CarteIntervention({ intervention, couleur, onOuvrir }: Props) {
  return (
    <article
      className="rounded border border-bordure border-l-[3px] bg-white text-xs"
      style={{ borderLeftColor: couleur }}
      aria-label={`${creneau(intervention)}, ${intervention.client.nomAffiche}`}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOuvrir(intervention)}
        className="block w-full rounded-r px-2 py-1.5 text-left hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle"
      >
        <span className="block font-semibold tabular-nums text-anthracite">
          {creneau(intervention)}
        </span>
        <span className="block truncate font-medium">{intervention.client.nomAffiche}</span>
        <span className="block truncate text-gris-texte">
          {intervention.type.libelle} · {intervention.adresse.ville}
        </span>
        <span className="mt-1 block">
          <BadgesIntervention intervention={intervention} />
        </span>
      </button>
    </article>
  );
}
