import { useCallback, useId, useState } from 'react';
import { clientsApi } from '../api/clients.api';
import type { Intervention, ListePaginee, StatutIntervention } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { CELLULE_TABLEAU, ENTETE_TABLEAU } from '../commun/classes';
import { dateHeureMetier } from '../commun/dates';
import { Pagination } from '../commun/Pagination';
import { useChargement } from '../commun/useChargement';
import { useReessai } from '../commun/useReessai';
import {
  CLASSES_STATUT,
  LIBELLES_STATUT,
  nombreDInterventions,
  nomComplet,
} from '../planning/presentation';
import { adresseSurUneLigne, BADGE } from './presentation';

/** Une fiche se lit d'un coup d'œil : l'historique avance par dix. */
const TAILLE_PAGE_HISTORIQUE = 10;

/** Dans l'ordre du cycle de vie, celui du message d'erreur de l'API. */
const STATUTS: StatutIntervention[] = [
  'A_PLANIFIER',
  'PLANIFIEE',
  'EN_COURS',
  'TERMINEE',
  'ANNULEE',
];

interface Props {
  idClient: number;
}

/**
 * US09 : interventions du client, toutes adresses confondues, dans l'ordre de l'API (de la plus
 * récemment créée à la plus ancienne), filtrables par statut.
 */
export function HistoriqueClient({ idClient }: Props) {
  const [page, setPage] = useState(1);
  const [statuts, setStatuts] = useState<StatutIntervention[]>([]);
  const charger = useCallback(
    (signal: AbortSignal) =>
      clientsApi.historique(idClient, { page, limit: TAILLE_PAGE_HISTORIQUE, statuts }, signal),
    [idClient, page, statuts],
  );
  const { etat, recharger, dernieresDonnees } = useChargement<ListePaginee<Intervention>>(charger);
  const liste = etat.statut === 'pret' ? etat.donnees : dernieresDonnees;
  const { zoneDeRepli, reessayer } = useReessai<HTMLDivElement>(recharger);

  const basculerStatut = (statut: StatutIntervention, coche: boolean) => {
    // Recalculé dans l'ordre de STATUTS : la requête ne dépend pas de l'ordre des clics.
    setStatuts((courants) =>
      STATUTS.filter((candidat) => (candidat === statut ? coche : courants.includes(candidat))),
    );
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <FiltreStatuts statuts={statuts} onBasculer={basculerStatut} />
      {/* Repli du focus après « Réessayer » ; ce bloc n'est pas dans l'ordre de tabulation. */}
      <div ref={zoneDeRepli} tabIndex={-1} className="space-y-3 focus:outline-none">
        {etat.statut === 'erreur' ? (
          <AlerteChargement message={etat.message} onReessayer={reessayer} />
        ) : (
          <ResultatsHistorique
            liste={liste}
            occupe={etat.statut === 'chargement'}
            filtre={statuts.length > 0}
            onChangerPage={setPage}
          />
        )}
      </div>
    </div>
  );
}

interface PropsFiltre {
  statuts: StatutIntervention[];
  onBasculer: (statut: StatutIntervention, coche: boolean) => void;
}

function FiltreStatuts({ statuts, onBasculer }: PropsFiltre) {
  const idAide = useId();
  return (
    // La bordure est portée par un bloc à part : un fieldset bordé incrusterait sa légende dedans.
    <div className="rounded-lg border border-bordure bg-white p-3">
      <fieldset aria-describedby={idAide}>
        <legend className="text-xs font-medium">Filtrer par statut</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {STATUTS.map((statut) => (
            <label key={statut} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={statuts.includes(statut)}
                onChange={(evenement) => onBasculer(statut, evenement.target.checked)}
                className="size-4 accent-sarcelle"
              />
              {LIBELLES_STATUT[statut]}
            </label>
          ))}
        </div>
        <p id={idAide} className="mt-2 text-xs text-gris-texte">
          Sans case cochée, tous les statuts sont affichés.
        </p>
      </fieldset>
    </div>
  );
}

interface PropsResultats {
  liste: ListePaginee<Intervention> | undefined;
  occupe: boolean;
  filtre: boolean;
  onChangerPage: (page: number) => void;
}

function ResultatsHistorique({ liste, occupe, filtre, onChangerPage }: PropsResultats) {
  // Un historique précédent vide ne dit rien du nouveau filtre : on attend sa réponse.
  if (!liste || (occupe && liste.data.length === 0)) {
    return (
      <p role="status" className="text-sm text-gris-texte">
        Chargement de l’historique…
      </p>
    );
  }
  if (liste.data.length === 0) {
    return (
      <p
        role="status"
        className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte"
      >
        {filtre ? 'Aucune intervention avec ces statuts.' : 'Aucune intervention pour ce client.'}
      </p>
    );
  }
  return (
    <>
      <TableauHistorique interventions={liste.data} occupe={occupe} />
      <Pagination
        meta={liste.meta}
        etiquette="Pages de l’historique des interventions"
        libelleTotal={nombreDInterventions(liste.meta.total)}
        onChangerPage={onChangerPage}
      />
    </>
  );
}

function TableauHistorique({
  interventions,
  occupe,
}: {
  interventions: Intervention[];
  occupe: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bordure bg-white">
      <table className="w-full min-w-180 border-collapse text-left" aria-busy={occupe}>
        <caption className="sr-only">
          Interventions du client, de la plus récemment créée à la plus ancienne
        </caption>
        <thead>
          <tr className="border-b border-bordure bg-fond">
            {['Date prévue', 'Type', 'Adresse', 'Statut', 'Technicien'].map((titre) => (
              <th key={titre} scope="col" className={ENTETE_TABLEAU}>
                {titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {interventions.map((intervention) => (
            <LigneHistorique key={intervention.id} intervention={intervention} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LigneHistorique({ intervention }: { intervention: Intervention }) {
  const { debutPrevu, tournee, statut } = intervention;
  return (
    <tr className="border-b border-bordure last:border-b-0">
      <td className={`${CELLULE_TABLEAU} tabular-nums`}>
        {debutPrevu ? (
          dateHeureMetier(debutPrevu)
        ) : (
          <span className="text-gris-texte">Non planifiée</span>
        )}
      </td>
      <td className={CELLULE_TABLEAU}>{intervention.type.libelle}</td>
      <td className={CELLULE_TABLEAU}>{adresseSurUneLigne(intervention.adresse)}</td>
      <td className={CELLULE_TABLEAU}>
        <span className={`${BADGE} ${CLASSES_STATUT[statut]}`}>{LIBELLES_STATUT[statut]}</span>
      </td>
      <td className={CELLULE_TABLEAU}>
        {tournee ? (
          nomComplet(tournee.technicien)
        ) : (
          <span className="text-gris-texte">Non affecté</span>
        )}
      </td>
    </tr>
  );
}
