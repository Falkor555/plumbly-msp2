import { createContext, useContext } from 'react';
import type { Profil } from '../api/auth.api';

/**
 * - verification : au chargement de la page, on tente de restaurer la session (cookie httpOnly) ;
 *   sans cet état, la page de connexion clignoterait avant chaque restauration réussie.
 * - deconnecte : pas de session ; « expiree » si elle a été perdue en cours d'utilisation.
 * - connecte : le profil est connu (rôle, mot de passe provisoire…).
 */
export type EtatSession =
  | { statut: 'verification' }
  | { statut: 'deconnecte'; motif?: 'expiree' | 'motDePasseChange' }
  | { statut: 'connecte'; profil: Profil };

export interface ValeurSession {
  etat: EtatSession;
  connecter(email: string, motDePasse: string): Promise<Profil>;
  deconnecter(): Promise<void>;
  changerMotDePasse(ancienMotDePasse: string, nouveauMotDePasse: string): Promise<void>;
}

/*
 * Séparé de FournisseurSession.tsx : un fichier qui exporte un composant React ne doit exporter
 * que des composants, sinon le rechargement à chaud de Vite (Fast Refresh) recharge toute la page.
 */
export const ContexteSession = createContext<ValeurSession | null>(null);

/** La session courante, depuis n'importe quel composant placé sous FournisseurSession. */
export function useSession(): ValeurSession {
  const valeur = useContext(ContexteSession);
  if (valeur === null) {
    throw new Error('useSession doit être utilisé sous <FournisseurSession>.');
  }
  return valeur;
}
