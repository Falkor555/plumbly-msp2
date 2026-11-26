import type { Intervention } from '../api/types';
import { CLASSES_STATUT, LIBELLES_STATUT, LIBELLES_URGENCE } from './presentation';

const BADGE =
  'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset';

interface Props {
  intervention: Pick<Intervention, 'statut' | 'urgence' | 'enRetard'>;
}

export function BadgesIntervention({ intervention }: Props) {
  return (
    <span className="flex flex-wrap gap-1">
      <span className={`${BADGE} ${CLASSES_STATUT[intervention.statut]}`}>
        {LIBELLES_STATUT[intervention.statut]}
      </span>
      {intervention.urgence !== 'NORMALE' && (
        <span className={`${BADGE} bg-chantier-clair text-chantier ring-chantier/20`}>
          {LIBELLES_URGENCE[intervention.urgence]}
        </span>
      )}
      {intervention.enRetard && (
        <span className={`${BADGE} bg-erreur-fond text-erreur-texte ring-erreur/20`}>
          En retard
        </span>
      )}
    </span>
  );
}
