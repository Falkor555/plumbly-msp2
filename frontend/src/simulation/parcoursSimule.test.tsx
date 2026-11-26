import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { effacerJetonAcces } from '../api/jetonAcces';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { GESTIONNAIRE_DEMONSTRATION } from './comptesDemonstration';
import { creerJeuDeDemonstration } from './donneesDemonstration';
import { compteConnecte } from './handlersAuthentification';
import { creerHandlersDeSimulation } from './handlersDeSimulation';

/*
 * Parcours de npm run dev:simule dans l'application complète (routeur, session, pages réelles),
 * servi par les mêmes faux serveurs que le mode simulé : si l'un des écrans parcourus appelle une
 * route non simulée, ou reçoit une réponse qu'il ne sait pas afficher, ce test échoue. Les autres
 * écrans (ma tournée, formulaires, export, import) ont leurs propres tests.
 */

/** Lundi 23 novembre 2026 ; « maintenant » est le mercredi 25 à 10 h, heure de La Réunion. */
const LUNDI = '2026-11-23';
const MAINTENANT = new Date('2026-11-25T06:00:00.000Z');

/** Requêtes qu'aucun faux serveur n'a simulées (setup.ts les fait déjà échouer). */
let nonSimulees: string[];
const noterNonSimulee = ({ request }: { request: Request }): void => {
  nonSimulees.push(`${request.method} ${request.url}`);
};

beforeEach(() => {
  nonSimulees = [];
  serveurApi.events.on('request:unhandled', noterNonSimulee);
  // La session simulée survit à un rechargement via sessionStorage : chaque test repart de zéro.
  sessionStorage.clear();
  const jeu = creerJeuDeDemonstration(LUNDI);
  serveurApi.use(
    ...creerHandlersDeSimulation(jeu, {
      urlApi,
      aujourdhui: () => LUNDI,
      maintenant: () => MAINTENANT,
    }),
  );
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  serveurApi.events.removeListener('request:unhandled', noterNonSimulee);
  window.history.replaceState(null, '', '/');
  effacerJetonAcces();
});

function navigationPrincipale(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Navigation principale' });
}

describe('parcours du mode simulé (npm run dev:simule)', () => {
  it('US01, US23, US08, US09, US02 : le gestionnaire de démonstration se connecte, voit le planning chargé, retrouve Hélène Payet sans accent et l’historique de sa fiche, ouvre la fiche d’un technicien et ses indisponibilités, puis se déconnecte, sans aucune requête non simulée', async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    // Connexion par la vraie page : le faux serveur accepte tout mot de passe non vide.
    await utilisateur.type(
      await screen.findByLabelText('Adresse e-mail'),
      GESTIONNAIRE_DEMONSTRATION.email,
    );
    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'demonstration');
    await utilisateur.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Planning' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/planning');
    expect(screen.getByText('Sophie Payet')).toBeInTheDocument();
    // Le titre s'affiche dès le chargement ; le sélecteur ne se remplit qu'une fois GET /tours lu
    // sans erreur. Le faux serveur renvoie les techniciens quelle que soit la semaine affichée.
    expect(await screen.findByRole('option', { name: 'Jean Rivière' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Clients : la liste, une recherche sans accent, puis la fiche d'Hélène Payet et l'historique.
    await utilisateur.click(within(navigationPrincipale()).getByRole('link', { name: 'Clients' }));
    expect(await screen.findByRole('link', { name: 'Expédit Payet' })).toBeInTheDocument();
    await utilisateur.type(
      screen.getByRole('searchbox', { name: 'Rechercher un client' }),
      'helene',
    );
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Expédit Payet' })).not.toBeInTheDocument(),
    );
    await utilisateur.click(screen.getByRole('link', { name: 'Hélène Payet' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hélène Payet' }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/clients/1');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Nombre d’interventions' })).toHaveTextContent(
        'Aucune intervention pour ce client.',
      ),
    );

    // Techniciens : la liste, puis la fiche de Jean Rivière et ses indisponibilités à venir.
    await utilisateur.click(
      within(navigationPrincipale()).getByRole('link', { name: 'Techniciens' }),
    );
    await utilisateur.click(await screen.findByRole('link', { name: 'Jean Rivière' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Jean Rivière' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Indisponibilités' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Nombre d’indisponibilités' })).toHaveTextContent(
        '1 indisponibilité',
      ),
    );
    expect(screen.getByText('Congé')).toBeInTheDocument();

    // Déconnexion : retour à la connexion, session simulée fermée.
    await utilisateur.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Connexion' })).toBeInTheDocument();
    expect(compteConnecte()).toBeNull();
    expect(nonSimulees).toEqual([]);
  });
});
