import { useState } from 'react';
import { rechercheEnvoyable } from '../api/parametres';
import { useValeurDifferee } from './useValeurDifferee';

/** Page demandée, avec la recherche envoyée au moment où elle l'a été. */
interface PageChoisie {
  numero: number;
  recherche: string | undefined;
}

/** C : critères choisis dans les menus et les cases de la liste, appliqués dès leur changement. */
export interface FiltresDeListe<C extends object> {
  /** Texte du champ, tel que tapé. */
  saisie: string;
  saisir: (saisie: string) => void;
  criteres: C;
  changerCriteres: (changement: Partial<C>) => void;
  /** Critères envoyés à l'API : la recherche, une fois le délai de frappe écoulé, et les autres. */
  criteresAppliques: C & { recherche: string | undefined };
  page: number;
  changerPage: (page: number) => void;
}

/**
 * Filtres d'une liste paginée de l'API (US08, US11). Tout changement de filtre ramène à la page 1 :
 * la page 3 d'une recherche n'a pas de sens pour la suivante. Pour les menus et les cases, c'est
 * fait dans le gestionnaire. La recherche, elle, ne change qu'après le délai de frappe : la page
 * retenue est liée à la recherche pour laquelle elle a été choisie, et l'état est corrigé pendant
 * le rendu dès que celle-ci change (motif « ajuster l'état pendant le rendu » de React). Un effet
 * remettrait la page à 1 après coup, donc après une lecture de trop.
 */
export function useFiltresDeListe<C extends object>(criteresInitiaux: C): FiltresDeListe<C> {
  const [saisie, saisir] = useState('');
  const [criteres, setCriteres] = useState<C>(criteresInitiaux);
  const [pageChoisie, setPageChoisie] = useState<PageChoisie>({ numero: 1, recherche: undefined });
  // Une saisie trop courte ou faite d'espaces n'est pas envoyée : elle ne relit pas la liste.
  const recherche = rechercheEnvoyable(useValeurDifferee(saisie));
  // Remise à 1 durable : revenir ensuite à l'ancienne recherche ne ressort pas l'ancienne page.
  // React relance aussitôt le rendu, avant d'afficher quoi que ce soit avec l'état périmé.
  if (pageChoisie.recherche !== recherche) setPageChoisie({ numero: 1, recherche });
  const page = pageChoisie.recherche === recherche ? pageChoisie.numero : 1;

  const changerCriteres = (changement: Partial<C>) => {
    setCriteres((courants) => ({ ...courants, ...changement }));
    setPageChoisie({ numero: 1, recherche });
  };

  return {
    saisie,
    saisir,
    criteres,
    changerCriteres,
    criteresAppliques: { ...criteres, recherche },
    page,
    changerPage: (numero) => setPageChoisie({ numero, recherche }),
  };
}
