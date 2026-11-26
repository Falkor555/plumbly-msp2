import { type ChangeEvent, type FormEvent, useCallback, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { type FiltresInterventions, interventionsApi } from '../api/interventions.api';
import type { Intervention, ListePaginee } from '../api/types';
import { dateMetierCourte } from '../commun/dates';
import { useChargement } from '../commun/useChargement';
import { BadgesIntervention } from '../planning/BadgesIntervention';
import {
  creneau,
  LIBELLES_STATUT,
  LIBELLES_URGENCE,
  nombreDInterventions,
  nomComplet,
} from '../planning/presentation';
import {
  type Brouillon,
  depuisBrouillon,
  erreursDuBrouillon,
  lireFiltres,
  STATUTS,
  URGENCES,
  versBrouillon,
  versParametres,
} from './filtres';

const CHAMP =
  'mt-1 block h-11 w-full rounded border border-gray-300 bg-white px-3 text-sm text-anthracite focus-visible:border-sarcelle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sarcelle';
const BOUTON_PRINCIPAL =
  'h-11 rounded bg-sarcelle px-4 text-sm font-semibold text-white hover:bg-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';
const BOUTON_SECONDAIRE =
  'h-11 rounded border border-gray-300 bg-white px-4 text-sm font-semibold text-sarcelle-profonde hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50';
const CELLULE = 'px-3 py-2 align-top';

/**
 * US15 : liste des interventions pour le bureau, les plus urgentes d'abord (RG18). Les filtres
 * sont gardés dans l'adresse : ils survivent au rechargement et se partagent par lien.
 */
export function PageInterventions() {
  const [parametres, setParametres] = useSearchParams();
  const adresse = parametres.toString();
  const filtres = useMemo(() => lireFiltres(new URLSearchParams(adresse)), [adresse]);
  const charger = useCallback(
    (signal: AbortSignal) => interventionsApi.lister(filtres, signal),
    [filtres],
  );
  const { etat, recharger } = useChargement<ListePaginee<Intervention>>(charger);
  const appliquer = (nouveaux: FiltresInterventions) => setParametres(versParametres(nouveaux));

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 md:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Interventions</h1>
        <p className="text-sm text-gris-texte">Demandes des clients, les plus urgentes d’abord.</p>
      </header>

      {/* La clé recrée le formulaire quand l'adresse change (précédent, lien partagé). */}
      <FormulaireFiltres key={adresse} initial={filtres} onAppliquer={appliquer} />

      {etat.statut === 'chargement' && (
        <p className="text-sm text-gris-texte">Chargement des interventions…</p>
      )}
      {etat.statut === 'erreur' && (
        <div
          role="alert"
          className="space-y-2 rounded border border-erreur/30 bg-red-50 px-4 py-3 text-sm text-erreur"
        >
          <p>{etat.message}</p>
          <button type="button" onClick={recharger} className="h-11 font-semibold underline">
            Réessayer
          </button>
        </div>
      )}
      {etat.statut === 'pret' && (
        <Resultats liste={etat.donnees} onPage={(page) => appliquer({ ...filtres, page })} />
      )}
    </main>
  );
}

interface PropsFormulaire {
  initial: FiltresInterventions;
  onAppliquer: (filtres: FiltresInterventions) => void;
}

function FormulaireFiltres({ initial, onAppliquer }: PropsFormulaire) {
  const id = useId();
  const [brouillon, setBrouillon] = useState<Brouillon>(() => versBrouillon(initial));
  const [erreurs, setErreurs] = useState<string[]>([]);

  const modifier =
    (champ: keyof Brouillon) => (evenement: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setBrouillon((courant) => ({ ...courant, [champ]: evenement.target.value }));

  function soumettre(evenement: FormEvent<HTMLFormElement>): void {
    evenement.preventDefault();
    const trouvees = erreursDuBrouillon(brouillon);
    setErreurs(trouvees);
    if (trouvees.length === 0) {
      onAppliquer(depuisBrouillon(brouillon));
    }
  }

  return (
    <form
      onSubmit={soumettre}
      aria-label="Filtres des interventions"
      className="grid gap-3 rounded-lg border border-bordure bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
    >
      <div className="lg:col-span-2">
        <label htmlFor={`${id}-recherche`} className="text-sm font-semibold">
          Recherche
        </label>
        <input
          id={`${id}-recherche`}
          type="search"
          placeholder="Client ou description"
          value={brouillon.recherche}
          onChange={modifier('recherche')}
          className={CHAMP}
        />
      </div>
      <div>
        <label htmlFor={`${id}-statut`} className="text-sm font-semibold">
          Statut
        </label>
        <select
          id={`${id}-statut`}
          value={brouillon.statut}
          onChange={modifier('statut')}
          className={CHAMP}
        >
          <option value="">Tous</option>
          {STATUTS.map((statut) => (
            <option key={statut} value={statut}>
              {LIBELLES_STATUT[statut]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-urgence`} className="text-sm font-semibold">
          Urgence
        </label>
        <select
          id={`${id}-urgence`}
          value={brouillon.urgence}
          onChange={modifier('urgence')}
          className={CHAMP}
        >
          <option value="">Toutes</option>
          {URGENCES.map((urgence) => (
            <option key={urgence} value={urgence}>
              {LIBELLES_URGENCE[urgence]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-du`} className="text-sm font-semibold">
          Du
        </label>
        <input
          id={`${id}-du`}
          type="date"
          value={brouillon.du}
          onChange={modifier('du')}
          className={CHAMP}
        />
      </div>
      <div>
        <label htmlFor={`${id}-au`} className="text-sm font-semibold">
          Au
        </label>
        <input
          id={`${id}-au`}
          type="date"
          value={brouillon.au}
          onChange={modifier('au')}
          className={CHAMP}
        />
      </div>

      {erreurs.length > 0 && (
        <ul role="alert" className="text-sm text-erreur sm:col-span-2 lg:col-span-6">
          {erreurs.map((erreur) => (
            <li key={erreur}>{erreur}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
        <button type="submit" className={BOUTON_PRINCIPAL}>
          Filtrer
        </button>
        <button
          type="button"
          onClick={() => onAppliquer({ page: 1 })}
          className={BOUTON_SECONDAIRE}
        >
          Effacer les filtres
        </button>
      </div>
    </form>
  );
}

interface PropsResultats {
  liste: ListePaginee<Intervention>;
  onPage: (page: number) => void;
}

function Resultats({ liste, onPage }: PropsResultats) {
  const { data, meta } = liste;
  if (meta.total === 0) {
    return (
      <p className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte">
        Aucune intervention ne correspond à ces filtres.
      </p>
    );
  }

  return (
    <section aria-label="Résultats" className="space-y-3">
      <p className="text-sm font-medium">{nombreDInterventions(meta.total)}</p>
      <div className="overflow-x-auto rounded-lg border border-bordure bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Interventions, les plus urgentes d’abord</caption>
          <thead className="bg-fond text-xs text-gris-texte uppercase">
            <tr>
              {['État', 'Client', 'Type', 'Description', 'Créneau', 'Technicien'].map((titre) => (
                <th key={titre} scope="col" className="px-3 py-2 font-semibold">
                  {titre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-bordure">
            {data.map((intervention) => (
              <tr key={intervention.id}>
                <td className={CELLULE}>
                  <BadgesIntervention intervention={intervention} />
                </td>
                <td className={CELLULE}>
                  <span className="font-medium">{intervention.client.nomAffiche}</span>
                  <span className="block text-gris-texte">{intervention.adresse.ville}</span>
                </td>
                <td className={CELLULE}>{intervention.type.libelle}</td>
                <td className={`${CELLULE} max-w-xs truncate`} title={intervention.description}>
                  {intervention.description}
                </td>
                <td className={`${CELLULE} whitespace-nowrap`}>
                  {intervention.debutPrevu
                    ? `${dateMetierCourte(intervention.debutPrevu)} · ${creneau(intervention)}`
                    : 'Non planifiée'}
                </td>
                <td className={CELLULE}>
                  {intervention.tournee
                    ? nomComplet(intervention.tournee.technicien)
                    : 'Non affectée'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          className={BOUTON_SECONDAIRE}
        >
          Précédent
        </button>
        <span>
          Page {meta.page} sur {meta.totalPages}
        </span>
        <button
          type="button"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
          className={BOUTON_SECONDAIRE}
        >
          Suivant
        </button>
      </nav>
    </section>
  );
}
