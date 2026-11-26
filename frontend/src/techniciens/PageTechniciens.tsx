import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router';
import { techniciensApi } from '../api/techniciens.api';
import type { FicheTechnicien, FiltresTechniciens, ListePaginee } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { AnnonceDuTotal } from '../commun/AnnonceDuTotal';
import { BOUTON_PRINCIPAL, LIEN } from '../commun/classes';
import { Pagination } from '../commun/Pagination';
import { useArriveeSurLaPage } from '../commun/useArriveeSurLaPage';
import { useChargement } from '../commun/useChargement';
import { useReessai } from '../commun/useReessai';
import { ZoneAnnonce } from '../commun/ZoneAnnonce';
import { nomComplet } from '../planning/presentation';
import { BarreFiltresTechniciens } from './BarreFiltresTechniciens';
import { FenetreNouveauTechnicien } from './FenetreNouveauTechnicien';
import { nombreDeTechniciens } from './presentation';
import { TableauTechniciens } from './TableauTechniciens';
import { TAILLE_PAGE_TECHNICIENS, useFiltresTechniciens } from './useFiltresTechniciens';

/** US11 : liste des techniciens, recherchée à la frappe, triée et paginée ; création de fiche. */
export function PageTechniciens() {
  const zonePrincipale = useRef<HTMLElement>(null);
  useArriveeSurLaPage(zonePrincipale);
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [ficheCreee, setFicheCreee] = useState<FicheTechnicien | null>(null);
  const filtres = useFiltresTechniciens();
  const { recherche, archives, tri } = filtres.criteresAppliques;
  const { page } = filtres;
  const charger = useCallback(
    (signal: AbortSignal) =>
      techniciensApi.lister(
        { recherche, archives, tri, page, limit: TAILLE_PAGE_TECHNICIENS },
        signal,
      ),
    [recherche, archives, tri, page],
  );
  const { etat, recharger, dernieresDonnees } =
    useChargement<ListePaginee<FicheTechnicien>>(charger);
  const { zoneDeRepli, reessayer } = useReessai<HTMLDivElement>(recharger);
  // Pendant une relecture (frappe, page suivante), la liste précédente reste affichée.
  const liste = etat.statut === 'pret' ? etat.donnees : dernieresDonnees;

  function ficheEnregistree(technicien: FicheTechnicien) {
    setCreationOuverte(false);
    setFicheCreee(technicien);
    recharger();
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
          <h1 className="text-2xl font-semibold tracking-tight">Techniciens</h1>
          <p className="text-sm text-gris-texte">
            Fiches des techniciens : téléphone et couleur du planning.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFicheCreee(null);
            setCreationOuverte(true);
          }}
          className={BOUTON_PRINCIPAL}
        >
          Nouveau technicien
        </button>
      </header>

      <ZoneAnnonce>{ficheCreee && <AnnonceFicheCreee technicien={ficheCreee} />}</ZoneAnnonce>
      {creationOuverte && (
        <FenetreNouveauTechnicien
          onFermer={() => setCreationOuverte(false)}
          onCreee={ficheEnregistree}
        />
      )}

      <BarreFiltresTechniciens
        saisie={filtres.saisie}
        saisir={filtres.saisir}
        criteres={filtres.criteres}
        changerCriteres={filtres.changerCriteres}
      />

      <AnnonceDuTotal
        etiquette="Nombre de techniciens"
        texte={
          etat.statut === 'pret' ? resultatDeLaListe(etat.donnees, filtres.criteresAppliques) : null
        }
      />
      {/* Repli du focus après « Réessayer » ; ce bloc n'est pas dans l'ordre de tabulation. */}
      <div ref={zoneDeRepli} tabIndex={-1} className="space-y-4 focus:outline-none">
        {etat.statut === 'erreur' ? (
          <AlerteChargement message={etat.message} onReessayer={reessayer} />
        ) : (
          <ResultatsTechniciens
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
  liste: ListePaginee<FicheTechnicien> | undefined;
  occupe: boolean;
  criteres: FiltresTechniciens;
  onChangerPage: (page: number) => void;
}

function ResultatsTechniciens({ liste, occupe, criteres, onChangerPage }: PropsResultats) {
  // Une liste précédente vide ne dit rien des nouveaux critères : on attend leur réponse.
  if (!liste || (occupe && liste.data.length === 0)) {
    return (
      <p role="status" className="text-sm text-gris-texte">
        Chargement des techniciens…
      </p>
    );
  }
  if (liste.data.length === 0) {
    // Sans role="status" : ce nœud est inséré avec son texte, c'est AnnonceDuTotal qui le lit.
    return (
      <p className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte">
        {messageAucunTechnicien(criteres)}
      </p>
    );
  }
  return (
    <>
      <TableauTechniciens techniciens={liste.data} occupe={occupe} />
      <Pagination
        meta={liste.meta}
        etiquette="Pages de la liste des techniciens"
        libelleTotal={nombreDeTechniciens(liste.meta.total)}
        onChangerPage={onChangerPage}
      />
    </>
  );
}

/**
 * Succès d'une création, avec le chemin vers la fiche : la liste triée ou filtrée peut ne pas
 * montrer le nouveau technicien.
 */
function AnnonceFicheCreee({ technicien }: { technicien: FicheTechnicien }) {
  return (
    <>
      Fiche de « {nomComplet(technicien)} » créée.{' '}
      <Link to={`/techniciens/${technicien.id}`} className={`${LIEN} font-semibold`}>
        Ouvrir sa fiche
      </Link>
    </>
  );
}

/** Annonce d'une réponse : le nombre de techniciens, ou le message qui remplace une liste vide. */
function resultatDeLaListe(
  liste: ListePaginee<FicheTechnicien>,
  criteres: FiltresTechniciens,
): string {
  return liste.data.length > 0
    ? nombreDeTechniciens(liste.meta.total)
    : messageAucunTechnicien(criteres);
}

/**
 * Seule la recherche restreint la liste : le tri ne fait que l'ordonner, et « Inclure les
 * archivés » l'élargit au lieu de la restreindre.
 */
function messageAucunTechnicien({ recherche }: FiltresTechniciens): string {
  return recherche !== undefined
    ? 'Aucun technicien ne correspond à ces critères.'
    : 'Aucun technicien enregistré pour le moment.';
}
