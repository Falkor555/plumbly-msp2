import { useId } from 'react';
import { LONGUEUR_MAX_RECHERCHE } from '../api/parametres';
import type { TriTechniciens } from '../api/types';
import { CHAMP_DE_FILTRE } from '../commun/classes';
import { OPTIONS_TRI_TECHNICIENS } from './presentation';
import type { FiltresDesTechniciens } from './useFiltresTechniciens';

/** Le menu ne propose que des tris connus ; une valeur inattendue revient au tri par défaut. */
function triChoisi(valeur: string): TriTechniciens {
  return OPTIONS_TRI_TECHNICIENS.find((option) => option.valeur === valeur)?.valeur ?? 'nom';
}

type Props = Pick<FiltresDesTechniciens, 'saisie' | 'saisir' | 'criteres' | 'changerCriteres'>;

/** US11 : recherche à la frappe sur le nom et le prénom, archivés et tri de la liste. */
export function BarreFiltresTechniciens({ saisie, saisir, criteres, changerCriteres }: Props) {
  const idRecherche = useId();
  const idAide = useId();
  return (
    <form
      role="search"
      aria-label="Rechercher et filtrer les techniciens"
      // La liste suit la frappe : Entrée n'a rien à envoyer de plus.
      onSubmit={(evenement) => evenement.preventDefault()}
      className="flex flex-wrap items-start gap-4 rounded-lg border border-bordure bg-white p-3"
    >
      <div className="min-w-64 flex-1">
        <label htmlFor={idRecherche} className="block text-xs font-medium">
          Rechercher un technicien
        </label>
        <input
          id={idRecherche}
          type="search"
          value={saisie}
          maxLength={LONGUEUR_MAX_RECHERCHE}
          onChange={(evenement) => saisir(evenement.target.value)}
          aria-describedby={idAide}
          className={`${CHAMP_DE_FILTRE} w-full`}
        />
        <p id={idAide} className="mt-1 text-xs text-gris-texte">
          Nom ou prénom, au moins 2 caractères.
        </p>
      </div>
      <label className="block text-xs font-medium">
        Trier par
        <select
          value={criteres.tri}
          onChange={(evenement) => changerCriteres({ tri: triChoisi(evenement.target.value) })}
          className={CHAMP_DE_FILTRE}
        >
          {OPTIONS_TRI_TECHNICIENS.map(({ valeur, libelle }) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-5 flex h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={criteres.archives}
          onChange={(evenement) => changerCriteres({ archives: evenement.target.checked })}
          className="size-4 accent-sarcelle"
        />
        Inclure les archivés
      </label>
    </form>
  );
}
