import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Profil } from './api/auth.api';
import { effacerJetonAcces } from './api/jetonAcces';
import type { Client } from './api/types';
import {
  clientsDeTest,
  fabriquerClient,
  heleneDeTest,
  listePaginee,
  servirLesClients,
} from './test/clientsDeTest';
import { enregistrerLesRequetes } from './test/msw/requetesRecues';
import { serveurApi, urlApi } from './test/msw/serveur';
import { karimDeTest, servirLesTechniciens, techniciensDeTest } from './test/techniciensDeTest';

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

  it('US15 : n’affiche ni la liste ni ses filtres à un technicien, renvoyé vers sa tournée', async () => {
    // Aucun handler pour GET /interventions : un appel ferait échouer le test.
    serveurApi.use(...sessionDe(KARIM), pasDeTournee);
    ouvrir('/interventions?statut=A_PLANIFIER');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ma tournée du jour' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ma-tournee');
    expect(
      screen.queryByRole('group', { name: 'Filtres prêts à l’emploi' }),
    ).not.toBeInTheDocument();
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

describe('écrans clients dans l’application (US08, US09)', () => {
  function navigationPrincipale(): HTMLElement {
    return screen.getByRole('navigation', { name: 'Navigation principale' });
  }

  function servirLaFicheDeHelene() {
    serveurApi.use(
      http.get(urlApi('/clients/7'), () => HttpResponse.json(heleneDeTest())),
      http.get(urlApi('/clients/7/interventions'), () => HttpResponse.json(listePaginee([]))),
    );
  }

  /** Simule la fiche du client sans y répondre avant l'appel de la fonction rendue. */
  function servirLaFicheRetenue(client: Client): () => void {
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    serveurApi.use(
      http.get(urlApi(`/clients/${client.id}`), async () => {
        await reponseRetenue;
        return HttpResponse.json(client);
      }),
      http.get(urlApi(`/clients/${client.id}/interventions`), () =>
        HttpResponse.json(listePaginee([])),
      ),
    );
    return () => liberer();
  }

  /** Défilements demandés depuis le dernier appel (espion posé par src/test/setup.ts). */
  function suivreLesDefilements() {
    const defilements = vi.mocked(window.scrollTo);
    defilements.mockClear();
    return defilements;
  }

  it('US08 : un gestionnaire connecté voit la liste des clients, signalée dans la navigation', async () => {
    serveurApi.use(...sessionDe(SOPHIE));
    servirLesClients(clientsDeTest());

    ouvrir('/clients');

    expect(await screen.findByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Hélène Payet' })).toBeInTheDocument();
    const navigation = navigationPrincipale();
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(navigation).getByRole('link', { name: 'Planning' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('US08 : renvoie un technicien vers sa tournée s’il ouvre la liste des clients', async () => {
    serveurApi.use(...sessionDe(KARIM), pasDeTournee);

    ouvrir('/clients');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ma tournée du jour' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ma-tournee');
  });

  it.each([
    ['qui n’est pas un nombre', '/clients/abc'],
    ['nul', '/clients/0'],
  ])(
    'US09 : un identifiant de fiche %s affiche « Page introuvable », le focus sur son contenu, sans interroger l’API',
    async (_cas, chemin) => {
      serveurApi.use(...sessionDe(SOPHIE));
      const lectures = enregistrerLesRequetes('get', '/clients/:id', () =>
        HttpResponse.json(heleneDeTest()),
      );

      ouvrir(chemin);

      const titre = await screen.findByRole('heading', { level: 1, name: 'Page introuvable' });
      expect(screen.getByRole('main')).toContainElement(titre);
      expect(screen.getByRole('main')).toHaveFocus();
      expect(screen.getByRole('link', { name: 'Retour à la liste des clients' })).toHaveAttribute(
        'href',
        '/clients',
      );
      expect(lectures).toHaveLength(0);
    },
  );

  it('US09 : un clic sur un client ouvre sa fiche sans recharger la page', async () => {
    const utilisateur = userEvent.setup();
    serveurApi.use(...sessionDe(SOPHIE));
    servirLesClients(clientsDeTest());
    servirLaFicheDeHelene();
    ouvrir('/clients');
    const navigation = await screen.findByRole('navigation', { name: 'Navigation principale' });

    await utilisateur.click(await screen.findByRole('link', { name: 'Hélène Payet' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hélène Payet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Coordonnées' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/clients/7');
    // La même barre est restée en place : seule la page a changé, la session n'a pas été relue.
    expect(navigationPrincipale()).toBe(navigation);
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('US09 : la fiche ouverte depuis la liste repart du haut, le focus au début de son contenu', async () => {
    const utilisateur = userEvent.setup();
    serveurApi.use(...sessionDe(SOPHIE));
    servirLesClients(clientsDeTest());
    servirLaFicheDeHelene();
    ouvrir('/clients');
    const lien = await screen.findByRole('link', { name: 'Hélène Payet' });
    const defilements = suivreLesDefilements();

    await utilisateur.click(lien);

    // Le lien activé a disparu avec la liste : le focus n'est pas retombé sur le document.
    const titre = await screen.findByRole('heading', { level: 1, name: 'Hélène Payet' });
    expect(screen.getByRole('main')).toContainElement(titre);
    expect(screen.getByRole('main')).toHaveFocus();
    expect(defilements).toHaveBeenCalledOnce();
    expect(defilements).toHaveBeenCalledWith(0, 0);
    await utilisateur.tab();
    expect(screen.getByRole('link', { name: 'Retour à la liste des clients' })).toHaveFocus();
  });

  it('US08 : « Retour à la liste des clients » rouvre la liste en haut, le focus sur son contenu', async () => {
    const utilisateur = userEvent.setup();
    serveurApi.use(...sessionDe(SOPHIE));
    servirLesClients(clientsDeTest());
    servirLaFicheDeHelene();
    ouvrir('/clients/7');
    await screen.findByRole('heading', { level: 1, name: 'Hélène Payet' });
    const defilements = suivreLesDefilements();

    await utilisateur.click(screen.getByRole('link', { name: 'Retour à la liste des clients' }));

    expect(await screen.findByRole('link', { name: 'Hélène Payet' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/clients');
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Clients' }),
    );
    expect(screen.getByRole('main')).toHaveFocus();
    expect(defilements).toHaveBeenCalledOnce();
    expect(defilements).toHaveBeenCalledWith(0, 0);
  });

  it('US09 : revenir par l’historique sur une autre fiche n’en montre ni l’ancien client ni son message pendant la lecture', async () => {
    const utilisateur = userEvent.setup();
    const boulangerie = fabriquerClient({
      id: 3,
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Boulangerie Técher',
      nomAffiche: 'Boulangerie Técher',
    });
    serveurApi.use(
      ...sessionDe(SOPHIE),
      http.post(urlApi('/clients/7/addresses/71/archive'), () =>
        HttpResponse.json({
          ...heleneDeTest().adresses[1],
          archive: true,
          archiveLe: '2026-11-25T06:00:00.000Z',
        }),
      ),
    );
    servirLaFicheDeHelene();
    const repondreSurLaBoulangerie = servirLaFicheRetenue(boulangerie);
    // Historique du navigateur : la fiche de la boulangerie, puis celle d'Hélène Payet.
    window.history.replaceState(null, '', '/clients/3');
    window.history.pushState(null, '', '/clients/7');
    render(<App />);
    await utilisateur.click(
      await screen.findByRole('button', { name: 'Archiver l’adresse 3 chemin des Tamarins' }),
    );
    await utilisateur.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Archiver l’adresse' }),
    );
    expect(await screen.findByText('Adresse archivée.')).toBeInTheDocument();

    window.history.back();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fiche client' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/clients/3');
    expect(screen.getByText('Chargement de la fiche du client…')).toBeInTheDocument();
    expect(screen.queryByText('Hélène Payet')).not.toBeInTheDocument();
    expect(screen.queryByText('Adresse archivée.')).not.toBeInTheDocument();
    repondreSurLaBoulangerie();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Boulangerie Técher' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Confirmation' })).toBeEmptyDOMElement();
  });
});

describe('écrans techniciens dans l’application (US11)', () => {
  function navigationPrincipale(): HTMLElement {
    return screen.getByRole('navigation', { name: 'Navigation principale' });
  }

  it('US11 : un gestionnaire connecté voit la liste des techniciens, signalée dans la navigation', async () => {
    serveurApi.use(...sessionDe(SOPHIE));
    servirLesTechniciens(techniciensDeTest());

    ouvrir('/techniciens');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Techniciens' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Karim Benali' })).toBeInTheDocument();
    const navigation = navigationPrincipale();
    expect(within(navigation).getByRole('link', { name: 'Techniciens' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(navigation).getByRole('link', { name: 'Clients' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('US11 : le lien « Techniciens » reste actif sur la fiche d’un technicien', async () => {
    serveurApi.use(
      ...sessionDe(SOPHIE),
      http.get(urlApi('/technicians/2'), () => HttpResponse.json(karimDeTest())),
      // La fiche lit aussi les indisponibilités dès qu'elle s'affiche : sans ce handler, la
      // lecture partait non simulée quand le test durait assez pour la voir partir (#66).
      http.get(urlApi('/technicians/2/unavailabilities'), () => HttpResponse.json([])),
    );

    ouvrir('/techniciens/2');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Karim Benali' }),
    ).toBeInTheDocument();
    expect(
      within(navigationPrincipale()).getByRole('link', { name: 'Techniciens' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['qui n’est pas un nombre', '/techniciens/abc'],
    ['nul', '/techniciens/0'],
  ])(
    'US11 : un identifiant de fiche %s affiche « Page introuvable », le focus sur son contenu, sans interroger l’API',
    async (_cas, chemin) => {
      serveurApi.use(...sessionDe(SOPHIE));
      const lectures = enregistrerLesRequetes('get', '/technicians/:id', () =>
        HttpResponse.json(karimDeTest()),
      );

      ouvrir(chemin);

      const titre = await screen.findByRole('heading', { level: 1, name: 'Page introuvable' });
      expect(screen.getByRole('main')).toContainElement(titre);
      expect(screen.getByRole('main')).toHaveFocus();
      expect(
        screen.getByRole('link', { name: 'Retour à la liste des techniciens' }),
      ).toHaveAttribute('href', '/techniciens');
      expect(lectures).toHaveLength(0);
    },
  );

  it('US11 : renvoie un technicien vers sa tournée s’il ouvre la liste des techniciens', async () => {
    serveurApi.use(...sessionDe(KARIM), pasDeTournee);

    ouvrir('/techniciens');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ma tournée du jour' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ma-tournee');
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
