import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import type { Profil } from './api/auth.api';
import { effacerJetonAcces } from './api/jetonAcces';
import { serveurApi, urlApi } from './test/msw/serveur';

const SOPHIE: Profil = {
  id: 3,
  email: 'gestion@plumbly.test',
  nom: 'Martin',
  prenom: 'Sophie',
  role: 'GESTIONNAIRE',
  mdpAChanger: false,
};
const KARIM: Profil = {
  id: 7,
  email: 'karim.benali@plumbly.test',
  nom: 'Benali',
  prenom: 'Karim',
  role: 'TECHNICIEN',
  mdpAChanger: false,
};

const sansSession = http.post(urlApi('/auth/refresh'), () =>
  HttpResponse.json(
    { statusCode: 401, message: 'Session expirée : se reconnecter.' },
    { status: 401 },
  ),
);
const sessionDe = (profil: Profil) => [
  http.post(urlApi('/auth/refresh'), () =>
    HttpResponse.json({ accessToken: 'jeton', expiresIn: 900 }),
  ),
  http.get(urlApi('/users/me'), () => HttpResponse.json(profil)),
];
const connexionReussie = (profil: Profil) =>
  http.post(urlApi('/auth/login'), () =>
    HttpResponse.json({ accessToken: 'jeton', expiresIn: 900, utilisateur: profil }),
  );
const refusDeConnexion = (statut: number, message: string) =>
  http.post(urlApi('/auth/login'), () =>
    HttpResponse.json({ statusCode: statut, message }, { status: statut }),
  );
const planningVide = http.get(urlApi('/tours'), () =>
  HttpResponse.json({ du: '', au: '', techniciens: [] }),
);
const pasDeTournee = http.get(
  urlApi('/tours/me/today'),
  () => new HttpResponse(null, { status: 204 }),
);

function ouvrir(chemin: string) {
  window.history.replaceState(null, '', chemin);
  render(<App />);
}

async function seConnecter(email: string, motDePasse = 'Plombier#2026!') {
  await userEvent.type(await screen.findByLabelText('Adresse e-mail'), email);
  await userEvent.type(screen.getByLabelText('Mot de passe'), motDePasse);
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
  effacerJetonAcces();
});

describe('connexion et navigation (US01, US02, US24)', () => {
  it('envoie vers la page de connexion sans session', async () => {
    serveurApi.use(sansSession);
    ouvrir('/planning');
    expect(await screen.findByRole('heading', { level: 1, name: 'Connexion' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/connexion');
  });

  it('connecte un gestionnaire et l’emmène au planning', async () => {
    serveurApi.use(sansSession, connexionReussie(SOPHIE), planningVide);
    ouvrir('/');
    await seConnecter(SOPHIE.email);
    expect(await screen.findByRole('heading', { level: 1, name: 'Planning' })).toBeInTheDocument();
    expect(screen.getByText('Sophie Martin')).toBeInTheDocument();
  });

  it('connecte un technicien et l’emmène à sa tournée, sans lien vers le planning', async () => {
    serveurApi.use(sansSession, connexionReussie(KARIM), pasDeTournee);
    ouvrir('/');
    await seConnecter(KARIM.email);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ma tournée du jour' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Planning' })).not.toBeInTheDocument();
  });

  it('affiche « E-mail ou mot de passe incorrect » et reste sur la page', async () => {
    serveurApi.use(sansSession, refusDeConnexion(401, 'E-mail ou mot de passe incorrect.'));
    ouvrir('/connexion');
    await seConnecter(SOPHIE.email, 'Mauvais#MotDePasse1');
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.');
    expect(window.location.pathname).toBe('/connexion');
  });

  it('signale le blocage après trop de tentatives (429)', async () => {
    serveurApi.use(sansSession, refusDeConnexion(429, 'Trop de tentatives de connexion.'));
    ouvrir('/connexion');
    await seConnecter(SOPHIE.email);
    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de tentatives');
  });

  it('restaure la session au rechargement, sans repasser par la connexion', async () => {
    serveurApi.use(...sessionDe(SOPHIE), planningVide);
    ouvrir('/planning');
    expect(await screen.findByRole('heading', { level: 1, name: 'Planning' })).toBeInTheDocument();
  });

  it('renvoie un technicien vers sa tournée s’il ouvre le planning', async () => {
    serveurApi.use(...sessionDe(KARIM), pasDeTournee);
    ouvrir('/planning');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ma tournée du jour' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ma-tournee');
  });

  it('déconnecte et revient à la page de connexion (US02)', async () => {
    serveurApi.use(
      ...sessionDe(SOPHIE),
      planningVide,
      http.post(urlApi('/auth/logout'), () => new HttpResponse(null, { status: 204 })),
    );
    ouvrir('/planning');
    await screen.findByRole('heading', { level: 1, name: 'Planning' });

    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Connexion' })).toBeInTheDocument();
  });
});

describe('mot de passe provisoire (US03)', () => {
  const NOUVEAU = 'Nouveau#MotDePasse2';
  const KARIM_PROVISOIRE: Profil = { ...KARIM, mdpAChanger: true };

  async function remplir(actuel: string, nouveau: string, confirmation: string) {
    await userEvent.type(await screen.findByLabelText('Mot de passe provisoire'), actuel);
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), nouveau);
    await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), confirmation);
  }

  it('impose le changement avant toute autre page', async () => {
    serveurApi.use(...sessionDe(KARIM_PROVISOIRE));
    ouvrir('/ma-tournee');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Choisissez votre mot de passe' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/mot-de-passe');
  });

  it('garde le bouton désactivé tant que la confirmation diffère', async () => {
    serveurApi.use(...sessionDe(KARIM_PROVISOIRE));
    ouvrir('/mot-de-passe');
    await remplir('Provisoire#1', NOUVEAU, 'Autre#MotDePasse3');
    expect(screen.getByText('Les deux mots de passe ne sont pas identiques.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer le mot de passe' })).toBeDisabled();
  });

  it('enregistre le nouveau mot de passe puis demande de se reconnecter', async () => {
    serveurApi.use(
      ...sessionDe(KARIM_PROVISOIRE),
      http.patch(urlApi('/users/me/password'), () => new HttpResponse(null, { status: 204 })),
    );
    ouvrir('/mot-de-passe');
    await remplir('Provisoire#1', NOUVEAU, NOUVEAU);

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Connexion' })).toBeInTheDocument();
    expect(
      screen.getByText('Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.'),
    ).toBeInTheDocument();
  });

  it('affiche le refus de l’API et reste sur la page', async () => {
    serveurApi.use(
      ...sessionDe(KARIM_PROVISOIRE),
      http.patch(urlApi('/users/me/password'), () =>
        HttpResponse.json(
          { statusCode: 400, message: ['ancienMotDePasse est incorrect'], error: 'Bad Request' },
          { status: 400 },
        ),
      ),
    );
    ouvrir('/mot-de-passe');
    await remplir('Faux#MotDePasse1', NOUVEAU, NOUVEAU);

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ancienMotDePasse est incorrect');
    expect(window.location.pathname).toBe('/mot-de-passe');
  });
});
