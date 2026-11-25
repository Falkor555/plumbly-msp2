import type { ListePaginee } from '../api/types';

const BOUTON =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-anthracite hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-white';

interface Props {
  meta: ListePaginee<unknown>['meta'];
  /** Nom de la navigation, qui distingue plusieurs listes paginées d'une même page. */
  etiquette: string;
  /** Total annoncé à côté des pages, par exemple « 12 clients ». */
  libelleTotal: string;
  onChangerPage: (page: number) => void;
}

/** Pagination des listes de l'API (US08, US09) : 20 éléments par page par défaut (§6.4). */
export function Pagination({ meta, etiquette, libelleTotal, onChangerPage }: Props) {
  // Une liste vide a totalPages = 0 : on affiche tout de même « Page 1 sur 1 ».
  const nombreDePages = Math.max(meta.totalPages, 1);
  return (
    <nav aria-label={etiquette} className="flex flex-wrap items-center gap-3 text-sm">
      {/* Message de statut (RGAA 7.5) : le nombre de résultats est lu après une recherche. */}
      <p role="status" className="text-gris-texte tabular-nums">
        {libelleTotal}
      </p>
      <div className="ml-auto flex items-center gap-3">
        <BoutonDePage
          libelle="Précédente"
          inactif={meta.page <= 1}
          onActiver={() => onChangerPage(meta.page - 1)}
        />
        <p aria-live="polite" className="tabular-nums">
          Page {meta.page} sur {nombreDePages}
        </p>
        <BoutonDePage
          libelle="Suivante"
          inactif={meta.page >= nombreDePages}
          onActiver={() => onChangerPage(meta.page + 1)}
        />
      </div>
    </nav>
  );
}

interface PropsBouton {
  libelle: string;
  inactif: boolean;
  onActiver: () => void;
}

/**
 * aria-disabled plutôt que disabled : arrivé sur la dernière page, « Suivante » devient inactif
 * alors qu'il a le focus. Un bouton disabled perdrait ce focus, renvoyé au document (RGAA 12.8) ;
 * celui-ci le garde, reste annoncé « indisponible », et son clic est sans effet. Le bouton n'est
 * pas non plus bloqué pendant la lecture : useChargement annule la précédente, et redemander la
 * même page est sans danger.
 */
function BoutonDePage({ libelle, inactif, onActiver }: PropsBouton) {
  return (
    <button
      type="button"
      aria-disabled={inactif || undefined}
      onClick={() => {
        if (!inactif) onActiver();
      }}
      className={BOUTON}
    >
      {libelle}
    </button>
  );
}
