import { useCallback } from 'react';
import { tourneesApi } from '../api/tournees.api';
import type { Intervention, StatutIntervention, Tournee } from '../api/types';
import { jourMetier, libelleJourLong } from '../commun/dates';
import { lienItineraire, lienTelephone } from '../commun/liens';
import { useChargement } from '../commun/useChargement';
import { BadgesIntervention } from '../planning/BadgesIntervention';
import { creneau, nombreDInterventions } from '../planning/presentation';

/** L'étape en cours est mise en avant ; celles qui sont finies passent au second plan. */
const CLASSES_ETAPE: Record<StatutIntervention, string> = {
  A_PLANIFIER: 'bg-white',
  PLANIFIEE: 'bg-white',
  EN_COURS: 'border-l-[3px] border-l-sarcelle bg-white',
  TERMINEE: 'bg-gray-50 text-gris-texte',
  ANNULEE: 'bg-gray-50 text-gris-texte',
};

/** US24 : la tournée du jour du technicien connecté, pensée pour le téléphone. */
export function PageMaTournee() {
  const charger = useCallback(
    (signal: AbortSignal) => tourneesApi.consulterMaTourneeDuJour(signal),
    [],
  );
  const { etat, recharger } = useChargement<Tournee | null>(charger);
  const jour =
    etat.statut === 'pret' && etat.donnees ? etat.donnees.dateTournee : jourMetier(new Date());

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-fond px-4 pt-4 pb-8">
      <header className="mb-4">
        <h1 className="text-[1.75rem] leading-9 font-bold tracking-tight">Ma tournée du jour</h1>
        <p className="text-sm text-gris-texte first-letter:uppercase">{libelleJourLong(jour)}</p>
      </header>

      {etat.statut === 'chargement' && (
        <p className="text-sm text-gris-texte">Chargement de votre tournée…</p>
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
      {etat.statut === 'pret' && etat.donnees === null && (
        <p className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte">
          Vous n'avez pas de tournée aujourd'hui.
        </p>
      )}
      {etat.statut === 'pret' && etat.donnees !== null && (
        <>
          <p className="mb-3 text-sm font-medium">
            {etat.donnees.interventions.length === 0
              ? 'Aucune intervention prévue pour le moment.'
              : `${nombreDInterventions(etat.donnees.interventions.length)}, dans l'ordre de passage`}
          </p>
          <ol className="space-y-3">
            {etat.donnees.interventions.map((intervention, rang) => (
              <EtapeTournee key={intervention.id} intervention={intervention} numero={rang + 1} />
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

function EtapeTournee({ intervention, numero }: { intervention: Intervention; numero: number }) {
  const { adresse, client } = intervention;
  return (
    <li className={`rounded-lg border border-bordure ${CLASSES_ETAPE[intervention.statut]}`}>
      <div className="flex items-start gap-3 border-b border-bordure px-4 py-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sarcelle text-sm font-bold text-white"
        >
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-titre text-lg font-semibold tabular-nums">
            <span className="sr-only">Étape {numero} : </span>
            {creneau(intervention)}
          </p>
          <p className="font-semibold">{intervention.type.libelle}</p>
          <p className="text-sm text-gris-texte">{intervention.dureeEstimeeMin} min</p>
          <div className="mt-1">
            <BadgesIntervention intervention={intervention} />
          </div>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm">
        <p className="font-semibold">{client.nomAffiche}</p>
        <a
          href={lienItineraire(adresse)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start justify-between gap-3 rounded border border-bordure px-3 py-2 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle"
        >
          <address className="not-italic">
            {adresse.rue}
            {adresse.complement && <span className="block">{adresse.complement}</span>}
            <span className="block">
              {adresse.codePostal} {adresse.ville}
            </span>
          </address>
          <span className="shrink-0 font-semibold text-sarcelle-profonde underline">
            Itinéraire
            <span className="sr-only"> (nouvel onglet)</span>
          </span>
        </a>
        {adresse.infosAcces && (
          <p className="rounded bg-fond px-3 py-2 text-gris-texte">
            <span className="font-semibold text-anthracite">Accès : </span>
            {adresse.infosAcces}
          </p>
        )}
        <p className="text-gris-texte">{intervention.description}</p>
        <a
          href={lienTelephone(client.telephone)}
          className="flex h-11 items-center justify-center rounded border border-gray-300 font-semibold text-sarcelle-profonde hover:bg-gray-100"
        >
          Appeler le client · {client.telephone}
        </a>
      </div>
    </li>
  );
}
