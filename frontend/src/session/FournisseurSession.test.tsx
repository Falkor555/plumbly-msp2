import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import type { Profil } from '../api/auth.api';
import { effacerJetonAcces, lireJetonAcces, terminerSession } from '../api/jetonAcces';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { FournisseurSession } from './FournisseurSession';
import { useSession } from './session';

const SOPHIE: Profil = {
  id: 3,
  email: 'gestion@plumbly.test',
  nom: 'Martin',
  prenom: 'Sophie',
  role: 'GESTIONNAIRE',
  mdpAChanger: false,
};

/** Affiche l'état de la session et donne accès aux actions, comme le fera l'application. */
function TemoinDeSession() {
  const { etat, connecter, deconnecter } = useSession();
  return (
    <div>
      <p>
        {etat.statut === 'connecte'
          ? `Connecté : ${etat.profil.prenom} (${etat.profil.role})`
          : etat.statut === 'deconnecte'
            ? `Déconnecté${etat.motif === 'expiree' ? ' : session expirée' : ''}`
            : 'Vérification de la session…'}
      </p>
      <button type="button" onClick={() => void connecter(SOPHIE.email, 'Plombier#2026!')}>
        Connexion
      </button>
      <button type="button" onClick={() => void deconnecter()}>
        Déconnexion
      </button>
    </div>
  );
}

function afficher() {
  render(
    <FournisseurSession>
      <TemoinDeSession />
    </FournisseurSession>,
  );
}

const sansSessionARestaurer = http.post(urlApi('/auth/refresh'), () =>
  HttpResponse.json(
    { statusCode: 401, message: 'Session expirée : se reconnecter.' },
    { status: 401 },
  ),
);

afterEach(() => effacerJetonAcces());

describe('FournisseurSession', () => {
  it('vérifie d’abord la session, sans afficher l’état déconnecté', () => {
    serveurApi.use(sansSessionARestaurer);
    afficher();
    expect(screen.getByText('Vérification de la session…')).toBeInTheDocument();
  });

  it('restaure la session après un rechargement grâce au cookie de rafraîchissement', async () => {
    serveurApi.use(
      http.post(urlApi('/auth/refresh'), () =>
        HttpResponse.json({ accessToken: 'jeton-restaure', expiresIn: 900 }),
      ),
      http.get(urlApi('/users/me'), () => HttpResponse.json(SOPHIE)),
    );
    afficher();
    expect(await screen.findByText('Connecté : Sophie (GESTIONNAIRE)')).toBeInTheDocument();
    expect(lireJetonAcces()).toBe('jeton-restaure');
  });

  it('passe à l’état déconnecté s’il n’y a pas de session à restaurer', async () => {
    serveurApi.use(sansSessionARestaurer);
    afficher();
    expect(await screen.findByText('Déconnecté')).toBeInTheDocument();
  });

  it('connecte l’utilisateur et garde le jeton d’accès en mémoire', async () => {
    serveurApi.use(
      sansSessionARestaurer,
      http.post(urlApi('/auth/login'), () =>
        HttpResponse.json({ accessToken: 'jeton-connexion', expiresIn: 900, utilisateur: SOPHIE }),
      ),
    );
    afficher();
    await screen.findByText('Déconnecté');

    await userEvent.click(screen.getByRole('button', { name: 'Connexion' }));

    expect(await screen.findByText('Connecté : Sophie (GESTIONNAIRE)')).toBeInTheDocument();
    expect(lireJetonAcces()).toBe('jeton-connexion');
    expect(localStorage.length).toBe(0);
  });

  it('déconnecte l’utilisateur même si l’API ne répond pas', async () => {
    serveurApi.use(
      http.post(urlApi('/auth/refresh'), () =>
        HttpResponse.json({ accessToken: 'jeton-restaure', expiresIn: 900 }),
      ),
      http.get(urlApi('/users/me'), () => HttpResponse.json(SOPHIE)),
      http.post(urlApi('/auth/logout'), () => HttpResponse.error()),
    );
    afficher();
    await screen.findByText('Connecté : Sophie (GESTIONNAIRE)');

    await userEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));

    expect(await screen.findByText('Déconnecté')).toBeInTheDocument();
    expect(lireJetonAcces()).toBeNull();
  });

  it('signale une session expirée en cours d’utilisation', async () => {
    serveurApi.use(
      http.post(urlApi('/auth/refresh'), () =>
        HttpResponse.json({ accessToken: 'jeton-restaure', expiresIn: 900 }),
      ),
      http.get(urlApi('/users/me'), () => HttpResponse.json(SOPHIE)),
    );
    afficher();
    await screen.findByText('Connecté : Sophie (GESTIONNAIRE)');

    // Ce que fait le client HTTP quand le rafraîchissement échoue au milieu d'une action.
    act(() => terminerSession());

    expect(screen.getByText('Déconnecté : session expirée')).toBeInTheDocument();
  });
});
