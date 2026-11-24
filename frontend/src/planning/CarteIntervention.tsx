import type { Intervention } from '../api/types';
import { BadgesIntervention } from './BadgesIntervention';
import { creneau } from './presentation';

interface Props {
  intervention: Intervention;
  couleur: string;
}

/** Résumé d'une intervention dans une case du planning. */
export function CarteIntervention({ intervention, couleur }: Props) {
  return (
    <article
      className="rounded border border-bordure border-l-[3px] bg-white px-2 py-1.5 text-xs"
      style={{ borderLeftColor: couleur }}
      aria-label={`${creneau(intervention)}, ${intervention.client.nomAffiche}`}
    >
      <p className="font-semibold tabular-nums text-anthracite">{creneau(intervention)}</p>
      <p className="truncate font-medium">{intervention.client.nomAffiche}</p>
      <p className="truncate text-gris-texte">
        {intervention.type.libelle} · {intervention.adresse.ville}
      </p>
      <div className="mt-1">
        <BadgesIntervention intervention={intervention} />
      </div>
    </article>
  );
}
