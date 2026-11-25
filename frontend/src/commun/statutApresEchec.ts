import { interventionsApi } from '../api/interventions.api';
import type { StatutIntervention } from '../api/types';

/**
 * Après l'échec d'un changement de statut, relit l'intervention (contrat d'API, 6.3) : la
 * requête a pu aboutir alors que la réponse s'est perdue (réseau mobile coupé), et un nouvel
 * essai répondrait 400 « déjà terminée ». Vrai si l'intervention a déjà le statut visé.
 *
 * Une relecture impossible répond faux : l'écran garde alors l'erreur d'origine, qui est vraie
 * du point de vue du technicien (l'action n'est pas confirmée).
 */
export async function statutAtteintMalgreLEchec(
  idIntervention: number,
  statutVise: StatutIntervention,
): Promise<boolean> {
  try {
    const intervention = await interventionsApi.consulter(idIntervention);
    return intervention.statut === statutVise;
  } catch (erreur) {
    console.error(`Relecture de l'intervention ${idIntervention} impossible`, erreur);
    return false;
  }
}
