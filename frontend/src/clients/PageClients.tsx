import { useCallback } from 'react';
import { clientsApi } from '../api/clients.api';
import type { Client, CriteresClients, ListePaginee } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { Pagination } from '../commun/Pagination';
import { useChargement } from '../commun/useChargement';
import { useReessai } from '../commun/useReessai';
import { BarreFiltresClients } from './BarreFiltresClients';
import { nombreDeClients } from './presentation';
import { TableauClients } from './TableauClients';
import { TAILLE_PAGE_CLIENTS, useFiltresClients } from './useFiltresClients';

/** US08 : liste des clients, recherchée à la frappe, filtrée, triée et paginée. */
export function PageClients() {
  const filtres = useFiltresClients();
  const { recherche, typeClient, archives, tri } = filtres.criteresAppliques;
  const { page } = filtres;
  const charger = useCallback(
    (signal: AbortSignal) =>
      clientsApi.lister(
        { recherche, typeClient, archives, tri, page, limit: TAILLE_PAGE_CLIENTS },
        signal,
      ),
    [recherche, typeClient, archives, tri, page],
  );
  const { etat, recharger, dernieresDonnees } = useChargement<ListePaginee<Client>>(charger);
  const { zoneDeRepli, reessayer } = useReessai<HTMLDivElement>(recharger);
  // Pendant une relecture (frappe, page suivante), la liste précédente reste affichée.
  const liste = etat.statut === 'pret' ? etat.donnees : dernieresDonnees;

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 md:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-gris-texte">
          Particuliers et professionnels, avec leurs adresses d’intervention.
        </p>
      </header>

      <BarreFiltresClients
        saisie={filtres.saisie}
        saisir={filtres.saisir}
        criteres={filtres.criteres}
        changerCriteres={filtres.changerCriteres}
      />

      {/* Repli du focus après « Réessayer » ; ce bloc n'est pas dans l'ordre de tabulation. */}
      <div ref={zoneDeRepli} tabIndex={-1} className="space-y-4 focus:outline-none">
        {etat.statut === 'erreur' ? (
          <AlerteChargement message={etat.message} onReessayer={reessayer} />
        ) : (
          <ResultatsClients
            liste={liste}
            occupe={etat.statut === 'chargement'}
            criteres={filtres.criteresAppliques}
            onChangerPage={filtres.changerPage}
          />
        )}
      </div>
    </main>
  );
}

interface PropsResultats {
  liste: ListePaginee<Client> | undefined;
  occupe: boolean;
  criteres: CriteresClients;
  onChangerPage: (page: number) => void;
}

function ResultatsClients({ liste, occupe, criteres, onChangerPage }: PropsResultats) {
  // Une liste précédente vide ne dit rien des nouveaux critères : on attend leur réponse.
  if (!liste || (occupe && liste.data.length === 0)) {
    return (
      <p role="status" className="text-sm text-gris-texte">
        Chargement des clients…
      </p>
    );
  }
  if (liste.data.length === 0) {
    return (
      <p
        role="status"
        className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte"
      >
        {criteresActifs(criteres)
          ? 'Aucun client ne correspond à ces critères.'
          : 'Aucun client enregistré pour le moment.'}
      </p>
    );
  }
  return (
    <>
      <TableauClients clients={liste.data} occupe={occupe} />
      <Pagination
        meta={liste.meta}
        etiquette="Pages de la liste des clients"
        libelleTotal={nombreDeClients(liste.meta.total)}
        onChangerPage={onChangerPage}
      />
    </>
  );
}

/** Le tri ne restreint pas la liste : seuls la recherche, le type et les archivés comptent. */
function criteresActifs({ recherche, typeClient, archives }: CriteresClients): boolean {
  return recherche !== undefined || typeClient !== undefined || archives === true;
}
