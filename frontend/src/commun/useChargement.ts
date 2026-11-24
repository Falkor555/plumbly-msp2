import { useCallback, useEffect, useState } from 'react';
import { ErreurApi } from '../api/erreurs';

export type EtatChargement<T> =
  { statut: 'chargement' } | { statut: 'erreur'; message: string } | { statut: 'pret'; donnees: T };

export interface Chargement<T> {
  etat: EtatChargement<T>;
  /** Relance la lecture, par exemple après une affectation. */
  recharger: () => void;
}

interface ResultatLecture<T> {
  charger: (signal: AbortSignal) => Promise<T>;
  version: number;
  etat: EtatChargement<T>;
}

const MESSAGE_ERREUR_INATTENDUE = 'Une erreur est survenue. Réessayez plus tard.';

/**
 * Charge une donnée de l'API et suit son état. `charger` doit être stable (useCallback) :
 * chaque nouvelle fonction relance la lecture et annule la précédente.
 */
export function useChargement<T>(charger: (signal: AbortSignal) => Promise<T>): Chargement<T> {
  const [version, setVersion] = useState(0);
  // Le résultat garde la lecture qui l'a produit : tant qu'il ne correspond pas à la lecture
  // en cours (nouvelle période, rechargement), l'état affiché est « chargement ».
  const [resultat, setResultat] = useState<ResultatLecture<T> | null>(null);

  useEffect(() => {
    const controleur = new AbortController();
    const terminer = (etat: EtatChargement<T>) => setResultat({ charger, version, etat });
    charger(controleur.signal).then(
      (donnees) => terminer({ statut: 'pret', donnees }),
      (erreur: unknown) => {
        // Une lecture annulée (changement de période, démontage) n'a plus de destinataire.
        if (controleur.signal.aborted) return;
        if (erreur instanceof ErreurApi) {
          terminer({ statut: 'erreur', message: erreur.messagePourUtilisateur() });
          return;
        }
        console.error('Chargement impossible', erreur);
        terminer({ statut: 'erreur', message: MESSAGE_ERREUR_INATTENDUE });
      },
    );
    return () => controleur.abort();
  }, [charger, version]);

  const etat: EtatChargement<T> =
    resultat && resultat.charger === charger && resultat.version === version
      ? resultat.etat
      : { statut: 'chargement' };
  const recharger = useCallback(() => setVersion((courante) => courante + 1), []);

  return { etat, recharger };
}
