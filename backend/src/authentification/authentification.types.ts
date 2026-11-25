import type { Role } from '../generated/prisma/client.ts';

/** POST /auth/login, une fois validé. */
export interface IdentifiantsConnexion {
  email: string;
  motDePasse: string;
}

/** Compte renvoyé à la connexion : de quoi rediriger selon le rôle (contrat d'API, 6.1). */
export interface UtilisateurConnecteApi {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  mdpAChanger: boolean;
}

export interface ReponseConnexion {
  accessToken: string;
  expiresIn: number;
  utilisateur: UtilisateurConnecteApi;
}

export interface ReponseRafraichissement {
  accessToken: string;
  expiresIn: number;
}

/**
 * Résultat du service : la réponse JSON, et le jeton de rafraîchissement que le contrôleur
 * place dans le cookie. Ce jeton n'apparaît jamais dans le corps de la réponse.
 */
export interface Session<Reponse> {
  reponse: Reponse;
  jetonRafraichissement: string;
}
