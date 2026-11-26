import { useEffect, useState } from 'react';

/** Délai de frappe au-delà duquel une recherche part (US08) : assez court pour paraître immédiat. */
export const DELAI_DE_FRAPPE_MS = 300;

/**
 * Renvoie la valeur reçue une fois qu'elle n'a plus changé pendant `delaiMs` : une recherche tapée
 * à la frappe n'interroge ainsi l'API qu'une fois la saisie posée, et non à chaque caractère.
 * Chaque nouvelle valeur relance le minuteur ; le démontage l'annule.
 */
export function useValeurDifferee<T>(valeur: T, delaiMs: number = DELAI_DE_FRAPPE_MS): T {
  const [valeurDifferee, setValeurDifferee] = useState(valeur);

  useEffect(() => {
    const minuteur = setTimeout(() => setValeurDifferee(valeur), delaiMs);
    return () => clearTimeout(minuteur);
  }, [valeur, delaiMs]);

  return valeurDifferee;
}
