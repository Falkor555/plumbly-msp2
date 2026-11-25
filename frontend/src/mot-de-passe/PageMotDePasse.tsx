import { type FormEvent, useId, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { EcranChargement } from '../commun/EcranChargement';
import { messageErreur } from '../commun/messageErreur';
import { accueilDe } from '../session/accueil';
import { useSession } from '../session/session';
import { REGLES_MOT_DE_PASSE, respecteLaPolitique } from './reglesMotDePasse';

const CHAMP =
  'mt-1 block h-11 w-full rounded border border-gray-300 bg-white px-3 text-base text-anthracite focus-visible:border-sarcelle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sarcelle aria-[invalid=true]:border-erreur';
const BOUTON_PRINCIPAL =
  'flex h-11 w-full items-center justify-center rounded bg-sarcelle px-4 font-semibold text-white hover:bg-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50';
const BOUTON_SECONDAIRE =
  'flex h-11 w-full items-center justify-center rounded border border-gray-300 bg-white px-4 font-semibold text-sarcelle-profonde hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';

/**
 * US03 : choix d'un mot de passe personnel à la place du mot de passe provisoire, obligatoire
 * avant d'utiliser l'application. US05 : changement volontaire, depuis la barre du haut.
 * L'API coupe ensuite toutes les sessions : l'utilisateur se reconnecte avec son nouveau mot de passe.
 */
export function PageMotDePasse() {
  const { etat, changerMotDePasse } = useSession();
  const id = useId();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (etat.statut === 'verification') {
    return <EcranChargement />;
  }
  if (etat.statut === 'deconnecte') {
    // Après l'enregistrement, la session est fermée : la page de connexion affiche le message.
    return <Navigate to="/connexion" replace />;
  }

  const { profil } = etat;
  const obligatoire = profil.mdpAChanger;
  const confirmationDifferente = confirmation !== '' && confirmation !== nouveau;
  const peutEnvoyer =
    actuel !== '' && respecteLaPolitique(nouveau) && nouveau === confirmation && !envoiEnCours;

  async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    if (!peutEnvoyer) {
      return;
    }
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      await changerMotDePasse(actuel, nouveau);
    } catch (echec) {
      // 400 : ancien mot de passe faux ou règle non respectée, message de l'API affiché tel quel.
      setErreur(messageErreur(echec, 'Changement de mot de passe'));
      setEnvoiEnCours(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fond px-4 py-8">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-bordure bg-white p-6 shadow-sm">
        <header className="space-y-2 text-center">
          <p className="font-titre text-2xl font-bold text-sarcelle-profonde">Plumbly</p>
          <h1 className="text-xl font-semibold">
            {obligatoire ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}
          </h1>
          {obligatoire && (
            <p className="text-sm text-gris-texte">
              Votre compte a été créé avec un mot de passe provisoire. Choisissez un mot de passe
              personnel pour continuer.
            </p>
          )}
        </header>

        <form onSubmit={(evenement) => void soumettre(evenement)} className="space-y-4">
          <div>
            <label htmlFor={`${id}-actuel`} className="text-sm font-semibold">
              {obligatoire ? 'Mot de passe provisoire' : 'Mot de passe actuel'}
            </label>
            <input
              id={`${id}-actuel`}
              type="password"
              autoComplete="current-password"
              required
              value={actuel}
              onChange={(evenement) => setActuel(evenement.target.value)}
              className={CHAMP}
            />
          </div>

          <div>
            <label htmlFor={`${id}-nouveau`} className="text-sm font-semibold">
              Nouveau mot de passe
            </label>
            <input
              id={`${id}-nouveau`}
              type="password"
              autoComplete="new-password"
              required
              aria-describedby={`${id}-regles`}
              value={nouveau}
              onChange={(evenement) => setNouveau(evenement.target.value)}
              className={CHAMP}
            />
            <ul id={`${id}-regles`} className="mt-2 space-y-1 text-sm">
              {REGLES_MOT_DE_PASSE.map((regle) => {
                const respectee = regle.estRespectee(nouveau);
                return (
                  <li key={regle.libelle} className={respectee ? 'text-succes' : 'text-gris-texte'}>
                    <span aria-hidden="true">{respectee ? '✓' : '○'}</span> {regle.libelle}
                    <span className="sr-only">{respectee ? ' : respectée' : ' : à respecter'}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <label htmlFor={`${id}-confirmation`} className="text-sm font-semibold">
              Confirmer le nouveau mot de passe
            </label>
            <input
              id={`${id}-confirmation`}
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={confirmationDifferente}
              aria-describedby={confirmationDifferente ? `${id}-difference` : undefined}
              value={confirmation}
              onChange={(evenement) => setConfirmation(evenement.target.value)}
              className={CHAMP}
            />
            {confirmationDifferente && (
              <p id={`${id}-difference`} className="mt-1 text-sm text-erreur">
                Les deux mots de passe ne sont pas identiques.
              </p>
            )}
          </div>

          {erreur !== null && (
            <p role="alert" className="text-sm whitespace-pre-line text-erreur">
              {erreur}
            </p>
          )}

          <p className="text-sm text-gris-texte">
            Vous devrez ensuite vous reconnecter avec votre nouveau mot de passe.
          </p>

          <button type="submit" disabled={!peutEnvoyer} className={BOUTON_PRINCIPAL}>
            {envoiEnCours ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
          </button>
          {!obligatoire && (
            <Link to={accueilDe(profil.role)} className={BOUTON_SECONDAIRE}>
              Annuler
            </Link>
          )}
        </form>
      </div>
    </main>
  );
}
