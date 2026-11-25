import { ErreurApi } from '../api/erreurs';

const MESSAGE_ERREUR_INATTENDUE = 'Une erreur est survenue. Réessayez plus tard.';

/**
 * Message à afficher après l'échec d'une action : celui de l'API pour un 400 ou un 409 (règle
 * de gestion, conflit), un texte générique sinon. Une erreur qui ne vient pas de l'API est un
 * défaut du front : elle part dans la console avec son contexte.
 */
export function messageErreur(erreur: unknown, contexte: string): string {
  if (erreur instanceof ErreurApi) return erreur.messagePourUtilisateur();
  console.error(contexte, erreur);
  return MESSAGE_ERREUR_INATTENDUE;
}
