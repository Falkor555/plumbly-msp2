import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/auth.api';
import { surSessionExpiree } from '../api/jetonAcces';
import { ContexteSession, type EtatSession } from './session';

/** Garde l'état de la session et le partage avec toute l'application (useSession). */
export function FournisseurSession({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatSession>({ statut: 'verification' });

  useEffect(() => {
    let monte = true;
    authApi
      .restaurerSession()
      .then((profil) => {
        if (monte) setEtat(profil ? { statut: 'connecte', profil } : { statut: 'deconnecte' });
      })
      .catch(() => {
        if (monte) setEtat({ statut: 'deconnecte' });
      });
    return () => {
      monte = false;
    };
  }, []);

  // Le client HTTP prévient quand le rafraîchissement échoue en cours d'utilisation.
  useEffect(() => surSessionExpiree(() => setEtat({ statut: 'deconnecte', motif: 'expiree' })), []);

  const connecter = useCallback(async (email: string, motDePasse: string) => {
    const profil = await authApi.connecter(email, motDePasse);
    setEtat({ statut: 'connecte', profil });
    return profil;
  }, []);

  const deconnecter = useCallback(async () => {
    await authApi.deconnecter();
    setEtat({ statut: 'deconnecte' });
  }, []);

  const changerMotDePasse = useCallback(async (ancien: string, nouveau: string) => {
    await authApi.changerMotDePasse(ancien, nouveau);
    // L'API a coupé toutes les sessions, celle-ci comprise : reconnexion avec le nouveau mot de passe.
    setEtat({ statut: 'deconnecte', motif: 'motDePasseChange' });
  }, []);

  const valeur = useMemo(
    () => ({ etat, connecter, deconnecter, changerMotDePasse }),
    [etat, connecter, deconnecter, changerMotDePasse],
  );
  return <ContexteSession.Provider value={valeur}>{children}</ContexteSession.Provider>;
}
