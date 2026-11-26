import { useId } from 'react';
import type { TypeIntervention, Urgence } from '../api/types';
import { LIBELLES_URGENCE } from '../planning/presentation';
import { avecType, DUREE_MAX, DUREE_MIN, LONGUEUR_DESCRIPTION_MAX, type Saisie } from './saisie';

const CHAMP =
  'mt-1 block w-full rounded border border-gray-300 bg-white px-3 text-sm text-anthracite focus-visible:border-sarcelle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sarcelle';
/** De la moins à la plus urgente : « Normale », choisie par défaut, vient en premier. */
const URGENCES_DU_FORMULAIRE: readonly Urgence[] = ['NORMALE', 'PRIORITAIRE', 'URGENTE'];

interface Props {
  types: TypeIntervention[];
  saisie: Saisie;
  onSaisie: (miseAJour: (courante: Saisie) => Saisie) => void;
}

/** Type, durée, urgence et description : mêmes champs en création (US14) et en modification (US16). */
export function ChampsDemande({ types, saisie, onSaisie }: Props) {
  const id = useId();
  const modifier = (champs: Partial<Saisie>) =>
    onSaisie((courante) => ({ ...courante, ...champs }));

  function choisirType(valeur: string): void {
    const type = types.find((candidat) => String(candidat.id) === valeur);
    onSaisie((courante) => avecType(courante, type));
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-type`} className="text-sm font-semibold">
            Type d’intervention
          </label>
          <select
            id={`${id}-type`}
            value={saisie.typeInterventionId}
            onChange={(evenement) => choisirType(evenement.target.value)}
            className={`${CHAMP} h-11`}
          >
            <option value="">Choisir un type</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-duree`} className="text-sm font-semibold">
            Durée estimée (minutes)
          </label>
          <input
            id={`${id}-duree`}
            type="number"
            inputMode="numeric"
            min={DUREE_MIN}
            max={DUREE_MAX}
            step={5}
            value={saisie.dureeEstimeeMin}
            onChange={(evenement) => modifier({ dureeEstimeeMin: evenement.target.value })}
            aria-describedby={`${id}-aide-duree`}
            className={`${CHAMP} h-11`}
          />
          <p id={`${id}-aide-duree`} className="mt-1 text-xs text-gris-texte">
            Préremplie avec la durée habituelle du type.
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold">Urgence</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {URGENCES_DU_FORMULAIRE.map((urgence) => (
            <label
              key={urgence}
              className="flex h-11 cursor-pointer items-center gap-2 rounded border border-bordure px-3 text-sm has-checked:border-sarcelle has-checked:bg-sarcelle-claire"
            >
              <input
                type="radio"
                name={`${id}-urgence`}
                value={urgence}
                checked={saisie.urgence === urgence}
                onChange={() => modifier({ urgence })}
                className="h-4 w-4 accent-sarcelle"
              />
              {LIBELLES_URGENCE[urgence]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${id}-description`} className="text-sm font-semibold">
          Description de la demande
        </label>
        <textarea
          id={`${id}-description`}
          rows={4}
          maxLength={LONGUEUR_DESCRIPTION_MAX}
          value={saisie.description}
          onChange={(evenement) => modifier({ description: evenement.target.value })}
          className={`${CHAMP} py-2`}
        />
        <p className="mt-1 text-right text-xs text-gris-texte">
          {saisie.description.length} / {LONGUEUR_DESCRIPTION_MAX}
        </p>
      </div>
    </>
  );
}
