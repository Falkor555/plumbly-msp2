import { useState } from 'react';
import { rechercheEnvoyable } from '../api/parametres';
import type { CriteresClients, TriClients, TypeClient } from '../api/types';
import { useValeurDifferee } from '../commun/useValeurDifferee';

/** 20 éléments par page, la valeur par défaut de l'API (cahier des charges §6.4). */
export const TAILLE_PAGE_CLIENTS = 20;

/** Critères choisis dans les menus et la case, appliqués dès leur changement. */
export interface CriteresChoisis {
  typeClient?: TypeClient;
  archives: boolean;
  tri: TriClients;
}

/** Page demandée, avec la recherche envoyée au moment où elle l'a été. */
interface PageChoisie {
  numero: number;
  recherche: string | undefined;
}

export interface FiltresDeLaListe {
  /** Texte du champ, tel que tapé. */
  saisie: string;
  saisir: (saisie: string) => void;
  criteres: CriteresChoisis;
  changerCriteres: (changement: Partial<CriteresChoisis>) => void;
  /** Critères envoyés à l'API, partagés par la liste et l'export (US32). */
  criteresAppliques: CriteresClients;
  page: number;
  changerPage: (page: number) => void;
}

/**
 * Filtres de la liste des clients (US08). Tout changement de filtre ramène à la page 1 : la page 3
 * d'une recherche n'a pas de sens pour la suivante. Pour les menus et la case, c'est fait dans le
 * gestionnaire. La recherche, elle, ne change qu'après le délai de frappe : la page retenue est
 * liée à la recherche pour laquelle elle a été choisie, et l'état est corrigé pendant le rendu dès
 * que celle-ci change (motif « ajuster l'état pendant le rendu » de React). Un effet remettrait la
 * page à 1 après coup, donc après une lecture de trop.
 */
export function useFiltresClients(): FiltresDeLaListe {
  const [saisie, saisir] = useState('');
  const [criteres, setCriteres] = useState<CriteresChoisis>({ archives: false, tri: 'nomAffiche' });
  const [pageChoisie, setPageChoisie] = useState<PageChoisie>({ numero: 1, recherche: undefined });
  // Une saisie trop courte ou faite d'espaces n'est pas envoyée : elle ne relit pas la liste.
  const recherche = rechercheEnvoyable(useValeurDifferee(saisie));
  // Remise à 1 durable : revenir ensuite à l'ancienne recherche ne ressort pas l'ancienne page.
  // React relance aussitôt le rendu, avant d'afficher quoi que ce soit avec l'état périmé.
  if (pageChoisie.recherche !== recherche) setPageChoisie({ numero: 1, recherche });
  const page = pageChoisie.recherche === recherche ? pageChoisie.numero : 1;

  const changerCriteres = (changement: Partial<CriteresChoisis>) => {
    setCriteres((courants) => ({ ...courants, ...changement }));
    setPageChoisie({ numero: 1, recherche });
  };

  return {
    saisie,
    saisir,
    criteres,
    changerCriteres,
    criteresAppliques: { recherche, ...criteres },
    page,
    changerPage: (numero) => setPageChoisie({ numero, recherche }),
  };
}
