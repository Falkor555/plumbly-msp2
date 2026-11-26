import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Intervention, ListePaginee } from '../api/types';
import { fabriquerIntervention } from '../simulation/donneesDemonstration';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageInterventions } from './PageInterventions';

function liste(
  data: Intervention[],
  meta: Partial<ListePaginee<Intervention>['meta']> = {},
): ListePaginee<Intervention> {
  return { data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1, ...meta } };
}

const FUITE = fabriquerIntervention({
  id: 1,
  client: 'Mme Hoarau',
  type: 'Recherche de fuite',
  ville: 'Saint-Denis',
  dureeEstimeeMin: 60,
});

/** Paramètres de chaque appel à GET /interventions, dans l'ordre. */
function simulerListe(reponse: ListePaginee<Intervention>): URLSearchParams[] {
  const appels: URLSearchParams[] = [];
  serveurApi.use(
    http.get(urlApi('/interventions'), ({ request }) => {
      appels.push(new URL(request.url).searchParams);
      return HttpResponse.json(reponse);
    }),
  );
  return appels;
}

/** Affiche l'adresse courante : les filtres doivent y être gardés (US15). */
function AdresseCourante() {
  const { search } = useLocation();
  return <output aria-label="Adresse">{search}</output>;
}

/** Une entrée avec un état imite l'arrivée depuis la page de création. */
function afficher(
  adresse: string | { pathname: string; search?: string; state?: unknown } = '/interventions',
) {
  render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route
          path="/interventions"
          element={
            <>
              <PageInterventions />
              <AdresseCourante />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('liste des interventions (US15)', () => {
  it('US15 : affiche les interventions avec leur état, leur client et leur type, 20 par page', async () => {
    const appels = simulerListe(liste([FUITE]));
    afficher();

    const tableau = await screen.findByRole('table');
    expect(within(tableau).getByText('Mme Hoarau')).toBeInTheDocument();
    expect(within(tableau).getByText('Recherche de fuite')).toBeInTheDocument();
    expect(screen.getByText('1 intervention')).toBeInTheDocument();
    expect(appels[0].get('limit')).toBe('20');
    expect(appels[0].get('statut')).toBeNull();
  });

  it('US15 : reprend les filtres présents dans l’adresse, comme après un rechargement', async () => {
    const appels = simulerListe(liste([FUITE]));
    afficher('/interventions?statut=A_PLANIFIER&urgence=URGENTE');

    await screen.findByRole('table');
    expect(appels[0].get('statut')).toBe('A_PLANIFIER');
    expect(appels[0].get('urgence')).toBe('URGENTE');
    expect(screen.getByLabelText('Statut')).toHaveValue('A_PLANIFIER');
  });

  it('US15 : applique les filtres choisis et les garde dans l’adresse', async () => {
    const appels = simulerListe(liste([FUITE]));
    afficher();
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('Recherche'), 'hoarau');
    await userEvent.selectOptions(screen.getByLabelText('Statut'), 'EN_COURS');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrer' }));

    await screen.findByRole('table');
    const dernier = appels.at(-1);
    expect(dernier?.get('statut')).toBe('EN_COURS');
    expect(dernier?.get('recherche')).toBe('hoarau');
    expect(screen.getByLabelText('Adresse')).toHaveTextContent('?recherche=hoarau&statut=EN_COURS');
  });

  it('US15 : signale une recherche d’un seul caractère sans appeler l’API', async () => {
    const appels = simulerListe(liste([FUITE]));
    afficher();
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('Recherche'), 'h');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrer' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La recherche doit contenir au moins 2 caractères.',
    );
    expect(appels).toHaveLength(1);
  });

  it('US15 : efface les filtres', async () => {
    const appels = simulerListe(liste([FUITE]));
    afficher('/interventions?statut=TERMINEE');
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));

    await screen.findByRole('table');
    expect(appels.at(-1)?.get('statut')).toBeNull();
    expect(screen.getByLabelText('Statut')).toHaveValue('');
  });

  it('US15 : passe à la page suivante', async () => {
    const appels = simulerListe(liste([FUITE], { total: 25, totalPages: 2 }));
    afficher();
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));

    await screen.findByRole('table');
    expect(appels.at(-1)?.get('page')).toBe('2');
  });

  it('US15 : indique qu’aucune intervention ne correspond aux filtres', async () => {
    simulerListe(liste([]));
    afficher('/interventions?statut=ANNULEE');
    expect(
      await screen.findByText('Aucune intervention ne correspond à ces filtres.'),
    ).toBeInTheDocument();
  });

  it('US16 : ouvre la fiche d’une intervention depuis le nom du client', async () => {
    simulerListe(liste([FUITE]));
    afficher('/interventions?statut=A_PLANIFIER');
    expect(await screen.findByRole('link', { name: 'Mme Hoarau' })).toHaveAttribute(
      'href',
      '/interventions/1',
    );
  });

  it('US14 : propose de créer une intervention depuis la liste', async () => {
    simulerListe(liste([FUITE]));
    afficher();
    expect(await screen.findByRole('link', { name: 'Nouvelle intervention' })).toHaveAttribute(
      'href',
      '/interventions/nouvelle',
    );
  });

  it('US14 : confirme la création, puis retire le message dès qu’un filtre change', async () => {
    const message = 'Intervention créée pour Mme Hoarau : elle est à planifier.';
    simulerListe(liste([FUITE]));
    afficher({
      pathname: '/interventions',
      search: '?statut=A_PLANIFIER',
      state: { messageCreation: message },
    });
    expect(await screen.findByText(message)).toHaveAttribute('role', 'status');

    await userEvent.selectOptions(screen.getByLabelText('Urgence'), 'URGENTE');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrer' }));

    await screen.findByRole('table');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('US15 : affiche une erreur avec « Réessayer » si l’API ne répond pas', async () => {
    serveurApi.use(http.get(urlApi('/interventions'), () => HttpResponse.error()));
    afficher();
    const alerte = await screen.findByRole('alert');
    expect(within(alerte).getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
