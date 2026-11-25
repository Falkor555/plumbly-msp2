import { type FormEvent, useId, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ErreurApi } from '../api/erreurs';
import { EcranChargement } from '../commun/EcranChargement';
import { messageErreur } from '../commun/messageErreur';
import { accueilDe } from '../session/accueil';
import { useSession } from '../session/session';

const IDENTIFIANTS_INCORRECTS = 'E-mail ou mot de passe incorrect.';

const CHAMP =
  'mt-1 block h-11 w-full rounded border border-gray-300 bg-white px-3 text-base text-anthracite focus-visible:border-sarcelle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sarcelle';
const BOUTON_PRINCIPAL =
  'flex h-11 w-full items-center justify-center rounded bg-sarcelle px-4 font-semibold text-white hover:bg-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Sur cette page, un 401 signifie « mauvais identifiants », pas « session expirée » :
 * le message générique des 401 serait trompeur ici.
 */
function messageDeConnexion(erreur: unknown): string {
  if (erreur instanceof ErreurApi && erreur.statut === 401) {
    return IDENTIFIANTS_INCORRECTS;
  }
  return messageErreur(erreur, 'Connexion');
}

/** US01 : connexion par e-mail et mot de passe, puis retour à la page demandée. */
export function PageConnexion() {
  const { etat, connecter } = useSession();
  const location = useLocation();
  const id = useId();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (etat.statut === 'verification') {
    return <EcranChargement />;
  }
  if (etat.statut === 'connecte') {
    // Après la connexion, ou si l'utilisateur est déjà connecté : la page demandée, sinon son accueil.
    const depuis = (location.state as { depuis?: string } | null)?.depuis;
    return <Navigate to={depuis ?? accueilDe(etat.profil.role)} replace />;
  }

  async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      // En cas de succès, la session passe à « connecté » et la page redirige d'elle-même.
      await connecter(email.trim(), motDePasse);
    } catch (echec) {
      setErreur(messageDeConnexion(echec));
      setEnvoiEnCours(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fond px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-bordure bg-white p-6 shadow-sm">
        <header className="space-y-1 text-center">
          <p className="font-titre text-2xl font-bold text-sarcelle-profonde">Plumbly</p>
          <h1 className="text-xl font-semibold">Connexion</h1>
        </header>

        {etat.motif === 'motDePasseChange' && (
          <p role="status" className="rounded bg-sarcelle-claire px-3 py-2 text-sm">
            Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.
          </p>
        )}

        {etat.motif === 'expiree' && (
          <p role="status" className="rounded bg-sarcelle-claire px-3 py-2 text-sm">
            Votre session a expiré. Reconnectez-vous pour continuer.
          </p>
        )}

        <form onSubmit={(evenement) => void soumettre(evenement)} className="space-y-4">
          <div>
            <label htmlFor={`${id}-email`} className="text-sm font-semibold">
              Adresse e-mail
            </label>
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(evenement) => setEmail(evenement.target.value)}
              className={CHAMP}
            />
          </div>
          <div>
            <label htmlFor={`${id}-mot-de-passe`} className="text-sm font-semibold">
              Mot de passe
            </label>
            <input
              id={`${id}-mot-de-passe`}
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(evenement) => setMotDePasse(evenement.target.value)}
              className={CHAMP}
            />
          </div>

          {erreur !== null && (
            <p role="alert" className="text-sm whitespace-pre-line text-erreur">
              {erreur}
            </p>
          )}

          <button type="submit" disabled={envoiEnCours} className={BOUTON_PRINCIPAL}>
            {envoiEnCours ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </main>
  );
}
