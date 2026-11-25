import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { clientsDeTest, heleneDeTest, listePaginee, servirLesClients } from './test/clientsDeTest';
import { serveurApi, urlApi } from './test/msw/serveur';

let requetes: string[];

beforeEach(() => {
  requetes = [];
  serveurApi.events.on('request:start', ({ request }) => {
    requetes.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return () => serveurApi.events.removeAllListeners();
});

afterEach(() => window.history.replaceState(null, '', '/'));

function lienDeNavigation(nom: string): HTMLElement {
  const navigation = screen.getByRole('navigation', { name: 'Navigation principale' });
  return within(navigation).getByRole('link', { name: nom });
}

describe('App (aiguillage provisoire en attendant le routeur de #9)', () => {
  it('US23 : affiche le planning du gestionnaire par défaut, rubrique Planning en cours', async () => {
    serveurApi.use(
      http.get(urlApi('/tours'), () => HttpResponse.json({ du: '', au: '', techniciens: [] })),
    );

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Planning' })).toBeInTheDocument();
    expect(await screen.findByText('Aucun technicien actif.')).toBeInTheDocument();
    expect(lienDeNavigation('Planning')).toHaveAttribute('aria-current', 'page');
    expect(lienDeNavigation('Clients')).not.toHaveAttribute('aria-current');
  });

  it('US24 : affiche la tournée du technicien sur /ma-tournee, sans la navigation du gestionnaire', async () => {
    serveurApi.use(
      http.get(urlApi('/tours/me/today'), () => new HttpResponse(null, { status: 204 })),
    );
    window.history.replaceState(null, '', '/ma-tournee');

    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ma tournée du jour' }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Vous n'avez pas de tournée aujourd'hui.")).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).toBeNull();
  });

  it('US08 : affiche la liste des clients sur /clients, rubrique Clients en cours', async () => {
    servirLesClients(clientsDeTest());
    window.history.replaceState(null, '', '/clients');

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Hélène Payet' })).toHaveAttribute(
      'href',
      '/clients/7',
    );
    expect(lienDeNavigation('Clients')).toHaveAttribute('aria-current', 'page');
    expect(lienDeNavigation('Planning')).not.toHaveAttribute('aria-current');
  });

  it('US09 : affiche la fiche du client dont l’identifiant est dans l’adresse', async () => {
    serveurApi.use(
      http.get(urlApi('/clients/7'), () => HttpResponse.json(heleneDeTest())),
      http.get(urlApi('/clients/7/interventions'), () => HttpResponse.json(listePaginee([]))),
    );
    window.history.replaceState(null, '', '/clients/7');

    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hélène Payet' }),
    ).toBeInTheDocument();
    expect(requetes).toContain('GET /api/v1/clients/7');
    // Le lien Clients mène à la liste, pas à cette fiche : rubrique en cours, sans être la page.
    expect(lienDeNavigation('Clients')).toHaveAttribute('aria-current', 'true');
    expect(lienDeNavigation('Planning')).not.toHaveAttribute('aria-current');
  });

  it.each([
    ['des lettres', '/clients/abc'],
    ['zéro', '/clients/0'],
    ['un zéro de tête', '/clients/007'],
    ['un nombre négatif', '/clients/-3'],
    ['un nombre décimal', '/clients/1.5'],
    ['un identifiant hors des entiers de l’API', '/clients/2147483648'],
    ['un chemin plus long', '/clients/7/adresses'],
  ])(
    'US09 : affiche « Page introuvable » pour %s, sans aucun appel à l’API',
    async (_cas, chemin) => {
      window.history.replaceState(null, '', chemin);

      render(<App />);

      expect(
        screen.getByRole('heading', { level: 1, name: 'Page introuvable' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Retour à la liste des clients' })).toHaveAttribute(
        'href',
        '/clients',
      );
      // Laisse partir une éventuelle requête avant de constater qu'il n'y en a eu aucune.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(requetes).toEqual([]);
    },
  );
});
