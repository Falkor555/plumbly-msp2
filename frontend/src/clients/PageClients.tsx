import { useCallback, useState } from 'react';
import { clientsApi } from '../api/clients.api';
import type { Client, CriteresClients, ListePaginee } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { BOUTON_PRINCIPAL, LIEN } from '../commun/classes';
import { Pagination } from '../commun/Pagination';
import { useChargement } from '../commun/useChargement';
import { useReessai } from '../commun/useReessai';
import { ZoneAnnonce } from '../commun/ZoneAnnonce';
import { BarreFiltresClients } from './BarreFiltresClients';
import { FenetreClient } from './FenetreClient';
import { nombreDeClients } from './presentation';
import { TableauClients } from './TableauClients';
import { TAILLE_PAGE_CLIENTS, useFiltresClients } from './useFiltresClients';

/** US08 : liste des clients, recherchée à la frappe, filtrée, triée et paginée ; US06 : création. */
export function PageClients() {
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [clientCree, setClientCree] = useState<Client | null>(null);
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

  function clientEnregistre(client: Client) {
    setCreationOuverte(false);
    setClientCree(client);
    recharger();
  }

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-gris-texte">
            Particuliers et professionnels, avec leurs adresses d’intervention.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setClientCree(null);
            setCreationOuverte(true);
          }}
          className={BOUTON_PRINCIPAL}
        >
          Nouveau client
        </button>
      </header>

      <ZoneAnnonce>{clientCree && <AnnonceClientCree client={clientCree} />}</ZoneAnnonce>
      {creationOuverte && (
        <FenetreClient onFermer={() => setCreationOuverte(false)} onEnregistre={clientEnregistre} />
      )}

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

/**
 * Succès d'une création, avec le chemin vers la fiche : la liste triée ou filtrée peut ne pas
 * montrer le nouveau client.
 */
function AnnonceClientCree({ client }: { client: Client }) {
  return (
    <>
      Client « {client.nomAffiche} » créé.{' '}
      <a href={`/clients/${client.id}`} className={`${LIEN} font-semibold`}>
        Ouvrir sa fiche
      </a>
    </>
  );
}

/** Le tri ne restreint pas la liste : seuls la recherche, le type et les archivés comptent. */
function criteresActifs({ recherche, typeClient, archives }: CriteresClients): boolean {
  return recherche !== undefined || typeClient !== undefined || archives === true;
}
