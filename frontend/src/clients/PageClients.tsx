import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router';
import { clientsApi } from '../api/clients.api';
import type { Client, CriteresClients, ListePaginee } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { AnnonceDuTotal } from '../commun/AnnonceDuTotal';
import { BOUTON_PRINCIPAL, BOUTON_SECONDAIRE, LIEN } from '../commun/classes';
import { Pagination } from '../commun/Pagination';
import { useArriveeSurLaPage } from '../commun/useArriveeSurLaPage';
import { useChargement } from '../commun/useChargement';
import { useReessai } from '../commun/useReessai';
import { ZoneAnnonce } from '../commun/ZoneAnnonce';
import { BarreFiltresClients } from './BarreFiltresClients';
import { FenetreClient } from './FenetreClient';
import { FenetreImport } from './FenetreImport';
import { nombreDeClients } from './presentation';
import { TableauClients } from './TableauClients';
import { useExportClients } from './useExportClients';
import { type CriteresChoisis, TAILLE_PAGE_CLIENTS, useFiltresClients } from './useFiltresClients';

/** Message de succès de la page : client créé (avec le lien vers sa fiche), export ou import. */
type Annonce = { sorte: 'clientCree'; client: Client } | { sorte: 'texte'; texte: string };

/**
 * US08 : liste des clients, recherchée à la frappe, filtrée, triée et paginée ; US06 : création ;
 * US32 : export en CSV de la liste affichée ; US31 : import depuis un fichier CSV.
 */
export function PageClients() {
  const zonePrincipale = useRef<HTMLElement>(null);
  useArriveeSurLaPage(zonePrincipale);
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  const exportClients = useExportClients((nomFichier) =>
    setAnnonce({
      sorte: 'texte',
      texte: `Export prêt : le téléchargement de « ${nomFichier} » a commencé.`,
    }),
  );
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
    setAnnonce({ sorte: 'clientCree', client });
    recharger();
  }

  function importFerme(importEffectue: boolean) {
    setImportOuvert(false);
    // Fermer l'assistant sans avoir importé ne change rien en base : la liste reste telle quelle.
    if (!importEffectue) return;
    setAnnonce({ sorte: 'texte', texte: 'Import terminé : la liste des clients est relue.' });
    recharger();
  }

  function exporter() {
    if (exportClients.enCours) return;
    // Vidée d'abord, pour qu'un second export du même fichier soit annoncé de nouveau.
    setAnnonce(null);
    exportClients.exporter(filtres.criteresAppliques);
  }

  function effacerLesMessages() {
    setAnnonce(null);
    exportClients.effacerErreur();
  }

  // Le refus d'un export (au-delà de 5 000 lignes) vaut pour les critères d'alors : il disparaît
  // dès que l'utilisateur les affine, comme le message l'y invite.
  function saisirRecherche(saisie: string) {
    exportClients.effacerErreur();
    filtres.saisir(saisie);
  }

  function changerCriteres(changement: Partial<CriteresChoisis>) {
    exportClients.effacerErreur();
    filtres.changerCriteres(changement);
  }

  return (
    // Cible du focus à l'arrivée sur la page ; hors de l'ordre de tabulation.
    <main
      ref={zonePrincipale}
      tabIndex={-1}
      className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 focus:outline-none md:px-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-gris-texte">
            Particuliers et professionnels, avec leurs adresses d’intervention.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              effacerLesMessages();
              setImportOuvert(true);
            }}
            className={BOUTON_SECONDAIRE}
          >
            Importer
          </button>
          {/* aria-disabled : le bouton garde le focus pendant le téléchargement (RGAA 12.8). */}
          <button
            type="button"
            aria-disabled={exportClients.enCours || undefined}
            onClick={exporter}
            className={BOUTON_SECONDAIRE}
          >
            {exportClients.enCours ? 'Export en cours…' : 'Exporter en CSV'}
          </button>
          <button
            type="button"
            onClick={() => {
              effacerLesMessages();
              setCreationOuverte(true);
            }}
            className={BOUTON_PRINCIPAL}
          >
            Nouveau client
          </button>
        </div>
      </header>

      <ZoneAnnonce>{annonce && <ContenuDeLAnnonce annonce={annonce} />}</ZoneAnnonce>
      {exportClients.erreur && (
        <p
          role="alert"
          className="rounded border border-erreur/30 bg-erreur-fond px-4 py-3 text-sm whitespace-pre-line text-erreur-texte"
        >
          {exportClients.erreur}
        </p>
      )}
      {creationOuverte && (
        <FenetreClient onFermer={() => setCreationOuverte(false)} onEnregistre={clientEnregistre} />
      )}
      {importOuvert && <FenetreImport onFermer={importFerme} />}

      <BarreFiltresClients
        saisie={filtres.saisie}
        saisir={saisirRecherche}
        criteres={filtres.criteres}
        changerCriteres={changerCriteres}
      />

      <AnnonceDuTotal
        etiquette="Nombre de clients"
        texte={
          etat.statut === 'pret' ? resultatDeLaListe(etat.donnees, filtres.criteresAppliques) : null
        }
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
    // Sans role="status" : ce nœud est inséré avec son texte, c'est AnnonceDuTotal qui le lit.
    return (
      <p className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte">
        {messageAucunClient(criteres)}
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

function ContenuDeLAnnonce({ annonce }: { annonce: Annonce }) {
  return annonce.sorte === 'clientCree' ? (
    <AnnonceClientCree client={annonce.client} />
  ) : (
    <>{annonce.texte}</>
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
      <Link to={`/clients/${client.id}`} className={`${LIEN} font-semibold`}>
        Ouvrir sa fiche
      </Link>
    </>
  );
}

/** Annonce d'une réponse : le nombre de clients, ou le message qui remplace une liste vide. */
function resultatDeLaListe(liste: ListePaginee<Client>, criteres: CriteresClients): string {
  return liste.data.length > 0 ? nombreDeClients(liste.meta.total) : messageAucunClient(criteres);
}

/**
 * Seuls la recherche et le type restreignent la liste : le tri ne fait que l'ordonner, et
 * « Inclure les archivés » l'élargit au lieu de la restreindre.
 */
function messageAucunClient({ recherche, typeClient }: CriteresClients): string {
  return recherche !== undefined || typeClient !== undefined
    ? 'Aucun client ne correspond à ces critères.'
    : 'Aucun client enregistré pour le moment.';
}
