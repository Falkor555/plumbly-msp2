import type { TechnicienResume } from '../api/types';
import type { Vue } from './navigation';
import { nomComplet } from './presentation';

const BOUTON_SECONDAIRE =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-anthracite hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';

interface Props {
  titrePeriode: string;
  vue: Vue;
  onChangerVue: (vue: Vue) => void;
  onPrecedent: () => void;
  onSuivant: () => void;
  onAujourdhui: () => void;
  techniciens: TechnicienResume[];
  technicienId: number | null;
  onFiltrer: (technicienId: number | null) => void;
}

export function BarrePlanning(props: Props) {
  const { vue, techniciens, technicienId } = props;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={props.onPrecedent}
          className={BOUTON_SECONDAIRE}
          aria-label={vue === 'semaine' ? 'Semaine précédente' : 'Jour précédent'}
        >
          ‹
        </button>
        <button type="button" onClick={props.onAujourdhui} className={BOUTON_SECONDAIRE}>
          Aujourd'hui
        </button>
        <button
          type="button"
          onClick={props.onSuivant}
          className={BOUTON_SECONDAIRE}
          aria-label={vue === 'semaine' ? 'Semaine suivante' : 'Jour suivant'}
        >
          ›
        </button>
      </div>

      <p className="font-titre text-lg font-semibold first-letter:uppercase" aria-live="polite">
        {props.titrePeriode}
      </p>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-medium">
          Technicien
          <select
            value={technicienId ?? ''}
            onChange={(evenement) =>
              props.onFiltrer(evenement.target.value ? Number(evenement.target.value) : null)
            }
            className="h-9 rounded border border-gray-300 bg-white px-2 text-sm focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none"
          >
            <option value="">Tous les techniciens</option>
            {techniciens.map((technicien) => (
              <option key={technicien.id} value={technicien.id}>
                {nomComplet(technicien)}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label="Affichage"
          className="flex rounded border border-gray-300 bg-white p-0.5"
        >
          {(['jour', 'semaine'] as const).map((choix) => (
            <button
              key={choix}
              type="button"
              aria-pressed={vue === choix}
              onClick={() => props.onChangerVue(choix)}
              className={`h-8 rounded-sm px-3 text-sm font-semibold capitalize ${
                vue === choix ? 'bg-sarcelle text-white' : 'text-gris-texte hover:bg-gray-100'
              }`}
            >
              {choix}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
