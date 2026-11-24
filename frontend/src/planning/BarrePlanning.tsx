import type { TechnicienResume } from '../api/types';
import type { Vue } from './navigation';
import { nomComplet } from './presentation';

const FOCUS_VISIBLE =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';
const BOUTON_SECONDAIRE = `h-9 rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-anthracite hover:bg-gray-100 ${FOCUS_VISIBLE}`;
const BOUTON_FLECHE = `h-9 w-9 text-lg text-gris-texte hover:bg-gray-100 hover:text-anthracite ${FOCUS_VISIBLE}`;

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
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bordure bg-white p-3">
      <div className="flex items-center rounded border border-gray-300 bg-white">
        <button
          type="button"
          onClick={props.onPrecedent}
          className={`${BOUTON_FLECHE} rounded-l`}
          aria-label={vue === 'semaine' ? 'Semaine précédente' : 'Jour précédent'}
        >
          ‹
        </button>
        <p
          className="min-w-56 px-2 text-center font-titre text-base font-semibold first-letter:uppercase"
          aria-live="polite"
        >
          {props.titrePeriode}
        </p>
        <button
          type="button"
          onClick={props.onSuivant}
          className={`${BOUTON_FLECHE} rounded-r`}
          aria-label={vue === 'semaine' ? 'Semaine suivante' : 'Jour suivant'}
        >
          ›
        </button>
      </div>

      <button type="button" onClick={props.onAujourdhui} className={BOUTON_SECONDAIRE}>
        Aujourd'hui
      </button>

      <span aria-hidden="true" className="hidden h-5 w-px bg-bordure sm:block" />

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
            className={`h-8 rounded-sm px-3 text-sm font-semibold capitalize ${FOCUS_VISIBLE} ${
              vue === choix ? 'bg-sarcelle text-white' : 'text-gris-texte hover:bg-gray-100'
            }`}
          >
            {choix}
          </button>
        ))}
      </div>

      <label className="ml-auto flex items-center gap-2 text-xs font-medium">
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
    </div>
  );
}
