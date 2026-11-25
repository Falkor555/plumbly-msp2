import { lireEmail, lireObjet, signalerErreurs } from '../commun/validation.ts';
import type { IdentifiantsConnexion } from './authentification.types.ts';

// Bien au-delà de la limite de la politique (128) : une saisie plus longue échoue à la
// vérification comme un mot de passe faux, sans révéler la règle à qui teste des comptes.
const LONGUEUR_SAISIE_MAXIMUM = 1_024;

/** Corps de POST /auth/login. L'e-mail est mis en minuscules : il est enregistré ainsi. */
export function lireConnexion(corps: unknown): IdentifiantsConnexion {
  const champs = lireObjet(corps, ['email', 'motDePasse']);
  const erreurs: string[] = [];
  const email = lireEmail(champs, 'email', erreurs, { obligatoire: true });
  const motDePasse = lireMotDePasseSaisi(champs.motDePasse, 'motDePasse', erreurs);
  signalerErreurs(erreurs);
  return { email: (email as string).toLowerCase(), motDePasse: motDePasse as string };
}

/**
 * Mot de passe tel que saisi, sans retirer les espaces (contrairement à lireTexte) :
 * un espace en début ou en fin fait partie du mot de passe.
 */
export function lireMotDePasseSaisi(
  valeur: unknown,
  nom: string,
  erreurs: string[],
): string | undefined {
  if (typeof valeur !== 'string' || valeur === '') {
    erreurs.push(`${nom} est obligatoire`);
    return undefined;
  }
  if (valeur.length > LONGUEUR_SAISIE_MAXIMUM) {
    erreurs.push(`${nom} est trop long`);
    return undefined;
  }
  return valeur;
}
