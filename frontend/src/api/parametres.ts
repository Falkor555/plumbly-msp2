import type { ParametresRequete } from './clientHttp';
import type {
  CriteresClients,
  FiltresTechniciens,
  Pagination,
  StatutIntervention,
  TriClients,
  TriTechniciens,
} from './types';

/*
 * Traduction des filtres d'écran en paramètres d'URL, partagée par les listes et par l'export
 * (US08, US32) pour que le fichier exporté corresponde exactement à la liste affichée. Les règles
 * suivent la validation de l'API (backend/src/commun/validation.ts), qui répond 400 sinon.
 */

/** L'API refuse limit au-delà de 100 (lirePagination). */
export const TAILLE_PAGE_MAX = 100;

/** L'API réduit la recherche puis exige au moins 2 caractères (lireRecherche). */
export const LONGUEUR_MIN_RECHERCHE = 2;

interface CriteresCommuns {
  recherche?: string;
  archives?: boolean;
  tri?: TriClients | TriTechniciens;
}

/**
 * Recherche, type, archivés et tri des clients, sans jamais de pagination : l'export refuse page
 * et limit. Les champs sont recopiés un à un pour qu'un objet de filtres plus large n'en ajoute
 * pas d'autre.
 */
export function parametresDeCriteresClients(criteres: CriteresClients): ParametresRequete {
  return { ...parametresCommuns(criteres), typeClient: criteres.typeClient };
}

/** GET /technicians refuse typeClient (400) : il n'est jamais recopié, même s'il est présent. */
export function parametresDeCriteresTechniciens(filtres: FiltresTechniciens): ParametresRequete {
  return parametresCommuns(filtres);
}

/**
 * L'API exige des entiers ≥ 1 et refuse limit au-delà de 100 : les valeurs sont ramenées dans ces
 * bornes plutôt que de provoquer un 400. Une valeur non finie est omise, l'API prend son défaut.
 */
export function parametresDePagination(pagination: Pagination): ParametresRequete {
  return {
    page: entierBorne(pagination.page, Number.MAX_SAFE_INTEGER),
    limit: entierBorne(pagination.limit, TAILLE_PAGE_MAX),
  };
}

/**
 * construireUrl refuse les tableaux, et une clé répétée deviendrait un tableau côté Express (400) :
 * l'API attend une seule valeur, les statuts séparés par des virgules.
 */
export function parametreDeStatuts(statuts?: StatutIntervention[]): string | undefined {
  return statuts && statuts.length > 0 ? statuts.join(',') : undefined;
}

function parametresCommuns(criteres: CriteresCommuns): ParametresRequete {
  return {
    recherche: rechercheEnvoyable(criteres.recherche),
    // archives=false est la valeur par défaut de l'API : on ne l'écrit que si la case est cochée.
    archives: criteres.archives ? 'true' : undefined,
    tri: criteres.tri,
  };
}

/**
 * Recherche telle que l'API la recevra, ou undefined si elle ne partira pas. Les écrans s'en
 * servent aussi pour ne relire la liste que lorsque la recherche envoyée change réellement.
 */
export function rechercheEnvoyable(recherche?: string): string | undefined {
  const texte = recherche?.trim() ?? '';
  return texte.length >= LONGUEUR_MIN_RECHERCHE ? texte : undefined;
}

function entierBorne(valeur: number | undefined, maximum: number): number | undefined {
  if (valeur === undefined || !Number.isFinite(valeur)) return undefined;
  return Math.min(Math.max(Math.trunc(valeur), 1), maximum);
}
