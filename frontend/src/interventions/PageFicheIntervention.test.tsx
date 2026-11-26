import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Intervention, StatutIntervention, TypeIntervention } from '../api/types';
import { fabriquerIntervention, planifier } from '../simulation/donneesDemonstration';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageFicheIntervention } from './PageFicheIntervention';

const TYPES: TypeIntervention[] = [
  { id: 40, libelle: 'Recherche de fuite', dureeDefautMin: 60 },
  { id: 3, libelle: 'Débouchage', dureeDefautMin: 45 },
];

/** Intervention n° 4, type n° 40 (fabriquerIntervention multiplie l'identifiant par 10). */
function intervention(statut: StatutIntervention = 'A_PLANIFIER'): Intervention {
  return {
    ...fabriquerIntervention({
      id: 4,
      client: 'Mme Hoarau',
      type: 'Recherche de fuite',
      ville: 'Saint-Denis',
      dureeEstimeeMin: 60,
    }),
    statut,
  };
}

/** Planifiée dans la tournée de Kévin Hoarau du 24 novembre. */
function interventionPlanifiee(): Intervention {
  return {
    ...planifier(intervention(), '2026-11-24', '08:00', 1),
    tournee: {
      id: 11,
      dateTournee: '2026-11-24',
      technicien: { id: 2, nom: 'Hoarau', prenom: 'Kévin' },
    },
  };
}

interface Appels {
  modifications: unknown[];
  annulations: unknown[];
}

/** GET de la fiche et des types ; PATCH et annulation renvoient l'intervention changée. */
function simulerApi(depart: Intervention = intervention()): Appels {
  const appels: Appels = { modifications: [], annulations: [] };
  serveurApi.use(
    http.get(urlApi('/intervention-types'), () => HttpResponse.json(TYPES)),
    http.get(urlApi('/interventions/4'), () => HttpResponse.json(depart)),
    http.patch(urlApi('/interventions/4'), async ({ request }) => {
      const corps = (await request.json()) as Partial<Intervention>;
      appels.modifications.push(corps);
      return HttpResponse.json({ ...depart, ...corps });
    }),
    http.post(urlApi('/interventions/4/cancel'), async ({ request }) => {
      const corps = (await request.json()) as { motif: string };
      appels.annulations.push(corps);
      return HttpResponse.json({
        ...depart,
        statut: 'ANNULEE',
        motifAnnulation: corps.motif,
        tournee: null,
        debutPrevu: null,
        finPrevue: null,
      });
    }),
  );
  return appels;
}

function afficher(chemin = '/interventions/4') {
  render(
    <MemoryRouter initialEntries={[chemin]}>
      <Routes>
        <Route path="/interventions/:id" element={<PageFicheIntervention />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('fiche d’une intervention (US16)', () => {
  it('US16 : affiche le client, l’adresse, la description et l’état de l’intervention', async () => {
    simulerApi();
    afficher();

    expect(
      await screen.findByRole('heading', { name: 'Recherche de fuite · Mme Hoarau' }),
    ).toBeInTheDocument();
    expect(screen.getByText('À planifier')).toBeInTheDocument();
    expect(screen.getByText('4 rue des Flamboyants')).toBeInTheDocument();
    expect(screen.getByText('Recherche de fuite chez Mme Hoarau')).toBeInTheDocument();
    expect(screen.getByText('Non affectée')).toBeInTheDocument();
  });

  it('US16 : modifie l’urgence et la description, en n’envoyant que les champs changés', async () => {
    const appels = simulerApi();
    afficher();

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    const formulaire = screen.getByRole('form', { name: 'Modifier l’intervention' });
    expect(within(formulaire).getByLabelText('Durée estimée (minutes)')).toHaveValue(60);
    await userEvent.click(within(formulaire).getByRole('radio', { name: 'Prioritaire' }));
    const description = within(formulaire).getByLabelText('Description de la demande');
    await userEvent.clear(description);
    await userEvent.type(description, 'Fuite au plafond de la salle de bain');
    await userEvent.click(within(formulaire).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Modifications enregistrées.');
    expect(appels.modifications).toEqual([
      { urgence: 'PRIORITAIRE', description: 'Fuite au plafond de la salle de bain' },
    ]);
    expect(screen.getByText('Fuite au plafond de la salle de bain')).toBeInTheDocument();
    expect(screen.getByText('Prioritaire')).toBeInTheDocument();
  });

  it('US16 : n’appelle pas l’API quand rien n’a changé', async () => {
    const appels = simulerApi();
    afficher();

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Aucune modification à enregistrer.');
    expect(appels.modifications).toHaveLength(0);
  });

  it('RG09 : affiche le conflit renvoyé par l’API et garde la saisie', async () => {
    simulerApi(interventionPlanifiee());
    serveurApi.use(
      http.patch(urlApi('/interventions/4'), () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Cette durée chevauche l’intervention suivante.' },
          { status: 409 },
        ),
      ),
    );
    afficher();

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    const duree = screen.getByLabelText('Durée estimée (minutes)');
    await userEvent.clear(duree);
    await userEvent.type(duree, '240');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cette durée chevauche l’intervention suivante.',
    );
    expect(duree).toHaveValue(240);
  });

  it('US16 et RG05 : annule l’intervention avec un motif', async () => {
    const appels = simulerApi();
    afficher();

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler l’intervention' }));
    const fenetre = screen.getByRole('dialog', { name: 'Annuler l’intervention' });
    await userEvent.type(within(fenetre).getByLabelText('Motif de l’annulation'), 'Client parti');
    await userEvent.click(within(fenetre).getByRole('button', { name: 'Confirmer l’annulation' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Intervention annulée.');
    expect(appels.annulations).toEqual([{ motif: 'Client parti' }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Client parti')).toBeInTheDocument();
    // RG06 : une intervention annulée ne se modifie plus.
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Annuler l’intervention' }),
    ).not.toBeInTheDocument();
  });

  it('RG05 : refuse une annulation sans motif, sans appeler l’API', async () => {
    const appels = simulerApi();
    afficher();

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler l’intervention' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer l’annulation' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Indiquez le motif de l’annulation.');
    expect(appels.annulations).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('US16 : prévient que l’annulation retire l’intervention de sa tournée', async () => {
    simulerApi(interventionPlanifiee());
    afficher();

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler l’intervention' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(
      /Elle sera retirée de la tournée de Kévin Hoarau/,
    );
  });

  it('RG15 : une intervention en cours s’annule encore, mais ne se modifie plus', async () => {
    simulerApi(intervention('EN_COURS'));
    afficher();

    expect(
      await screen.findByRole('button', { name: 'Annuler l’intervention' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(
      screen.getByText('En cours : elle ne se modifie plus, mais peut encore être annulée.'),
    ).toBeInTheDocument();
  });

  it('RG06 : une intervention terminée ne propose ni modification ni annulation', async () => {
    simulerApi(intervention('TERMINEE'));
    afficher();

    expect(
      await screen.findByText('Cette intervention est terminée : elle ne se modifie plus.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Annuler l’intervention' }),
    ).not.toBeInTheDocument();
  });

  it('US16 : signale une intervention introuvable', async () => {
    serveurApi.use(
      http.get(urlApi('/intervention-types'), () => HttpResponse.json(TYPES)),
      http.get(urlApi('/interventions/99'), () =>
        HttpResponse.json(
          { statusCode: 404, message: 'Intervention introuvable.' },
          { status: 404 },
        ),
      ),
    );
    afficher('/interventions/99');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "L'élément demandé est introuvable.",
    );
    expect(screen.getByRole('link', { name: 'Retour à la liste' })).toHaveAttribute(
      'href',
      '/interventions',
    );
  });

  it('US16 : ne demande rien à l’API pour un numéro d’intervention invalide', async () => {
    afficher('/interventions/abc');
    // Aucun handler : une requête partie ferait échouer le test (onUnhandledFrame: 'error' dans src/test/setup.ts).
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
