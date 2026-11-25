import { api, rafraichirJetonAcces } from './clientHttp';
import { effacerJetonAcces, enregistrerJetonAcces } from './jetonAcces';

export type Role = 'ADMIN' | 'GESTIONNAIRE' | 'TECHNICIEN';

/** Ce que l'application sait de l'utilisateur connecté (contrat d'API, 6.1 et 6.2). */
export interface Profil {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  /** Mot de passe provisoire : à changer avant d'utiliser l'application (US03). */
  mdpAChanger: boolean;
}

interface ReponseConnexion {
  accessToken: string;
  expiresIn: number;
  utilisateur: Profil;
}

/** Appels des routes d'authentification (contrat d'API, 5.1 et 5.2). */
export const authApi = {
  /** US01. Publique : sans jeton, et un 401 ne déclenche pas de rafraîchissement. */
  async connecter(email: string, motDePasse: string): Promise<Profil> {
    const reponse = await api.post<ReponseConnexion>(
      '/auth/login',
      { email, motDePasse },
      { publique: true },
    );
    enregistrerJetonAcces(reponse.accessToken);
    return reponse.utilisateur;
  },

  /**
   * Après un rechargement de page, le jeton d'accès (gardé en mémoire) est perdu ; le cookie
   * httpOnly de rafraîchissement, lui, est toujours là. null : pas de session à restaurer.
   */
  async restaurerSession(): Promise<Profil | null> {
    if (!(await rafraichirJetonAcces())) return null;
    return api.get<Profil>('/users/me');
  },

  /**
   * US02. La session locale est effacée même si l'appel échoue (réseau coupé, session déjà
   * expirée) : l'utilisateur qui se déconnecte doit l'être dans tous les cas.
   */
  async deconnecter(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Rien à faire : la session locale est effacée ci-dessous quoi qu'il arrive.
    } finally {
      effacerJetonAcces();
    }
  },
};
