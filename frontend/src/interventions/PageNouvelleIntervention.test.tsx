import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Adresse, Client, ListePaginee, TypeIntervention } from '../api/types';
import { fabriquerIntervention } from '../simulation/donneesDemonstration';
import { fabriquerAdresse, fabriquerClient } from '../simulation/fabriques';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageNouvelleIntervention } from './PageNouvelleIntervention';

const TYPES: TypeIntervention[] = [
  { id: 3, libelle: 'Débouchage', dureeDefautMin: 45 },
  { id: 5, libelle: 'Recherche de fuite', dureeDefautMin: 90 },
];

// Les fabriques complètent le reste de l'objet de l'API (#16) : seuls comptent ici l'identité et
// les adresses du client.
function adresse(id: number, rue: string, ville: string): Adresse {
  return fabriquerAdresse({ id, rue, codePostal: '97400', ville });
}

const DUPONT: Client = fabriquerClient({
  id: 8,
  typeClient: 'PARTICULIER',
  nomAffiche: 'Jean Dupont',
  telephone: '0692123456',
  adresses: [adresse(15, '12 rue des Lilas', 'Saint-Denis')],
});

const GARAGE: Client = fabriquerClient({
  id: 9,
  typeClient: 'PROFESSIONNEL',
  nomAffiche: 'Garage Hoarau',
  telephone: '0262123456',
  adresses: [
    adresse(21, '3 chemin Bœuf Mort', 'Le Tampon'),
    adresse(22, '8 rue du Port', 'Saint-Pierre'),
  ],
});

function page(clients: Client[]): ListePaginee<Client> {
  return { data: clients, meta: { page: 1, limit: 10, total: clients.length, totalPages: 1 } };
}

interface Appels {
  recherches: URLSearchParams[];
  creations: unknown[];
}

/** Types, recherche de clients et création : chaque appel est noté pour être vérifié. */
function simulerApi(clients: Client[] = [DUPONT, GARAGE]): Appels {
  const appels: Appels = { recherches: [], creations: [] };
  serveurApi.use(
    http.get(urlApi('/intervention-types'), () => HttpResponse.json(TYPES)),
    http.get(urlApi('/clients'), ({ request }) => {
      appels.recherches.push(new URL(request.url).searchParams);
      return HttpResponse.json(page(clients));
    }),
    http.post(urlApi('/interventions'), async ({ request }) => {
      appels.creations.push(await request.json());
      return HttpResponse.json(
        fabriquerIntervention({
          id: 40,
          client: 'Jean Dupont',
          type: 'Débouchage',
          ville: 'Saint-Denis',
          dureeEstimeeMin: 45,
        }),
        { status: 201 },
      );
    }),
  );
  return appels;
}

/** La liste n'est pas affichée ici : on vérifie seulement l'adresse et le message transmis. */
function ArriveeSurLaListe() {
  const { search, state } = useLocation();
  return (
    <output aria-label="Liste">
      {search} {(state as { messageCreation?: string } | null)?.messageCreation}
    </output>
  );
}

function afficher() {
  render(
    <MemoryRouter initialEntries={['/interventions/nouvelle']}>
      <Routes>
        <Route path="/interventions/nouvelle" element={<PageNouvelleIntervention />} />
        <Route path="/interventions" element={<ArriveeSurLaListe />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function choisirClient(recherche: string, nom: string) {
  await userEvent.type(await screen.findByLabelText('Client'), recherche);
  await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(nom) }));
}

describe('création d’une intervention (US14)', () => {
  it('US14 et RG01 : crée l’intervention puis ouvre la liste « à planifier » avec un message', async () => {
    const appels = simulerApi();
    afficher();

    await choisirClient('dupont', 'Jean Dupont');
    // Une seule adresse en service : elle est choisie d'office.
    expect(screen.getByRole('radio', { name: /12 rue des Lilas/ })).toBeChecked();
    await userEvent.selectOptions(screen.getByLabelText('Type d’intervention'), 'Débouchage');
    await userEvent.click(screen.getByRole('radio', { name: 'Urgente' }));
    await userEvent.type(screen.getByLabelText('Description de la demande'), 'Évier bouché');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’intervention' }));

    expect(await screen.findByLabelText('Liste')).toHaveTextContent(
      '?statut=A_PLANIFIER Intervention créée pour Jean Dupont : elle est à planifier.',
    );
    expect(appels.recherches[0].get('recherche')).toBe('dupont');
    expect(appels.creations).toEqual([
      {
        adresseId: 15,
        typeInterventionId: 3,
        description: 'Évier bouché',
        urgence: 'URGENTE',
        dureeEstimeeMin: 45,
      },
    ]);
  });

  it('US14 : préremplit la durée avec celle du type choisi, et la laisse modifier', async () => {
    simulerApi();
    afficher();
    const duree = await screen.findByLabelText('Durée estimée (minutes)');

    await userEvent.selectOptions(screen.getByLabelText('Type d’intervention'), 'Débouchage');
    expect(duree).toHaveValue(45);
    await userEvent.selectOptions(
      screen.getByLabelText('Type d’intervention'),
      'Recherche de fuite',
    );
    expect(duree).toHaveValue(90);

    await userEvent.clear(duree);
    await userEvent.type(duree, '120');
    expect(duree).toHaveValue(120);
  });

  it('US14 : un client à plusieurs adresses impose de choisir l’adresse avant l’envoi', async () => {
    const appels = simulerApi();
    afficher();

    await choisirClient('hoarau', 'Garage Hoarau');
    const adresses = screen.getByRole('group', { name: 'Adresse de l’intervention' });
    expect(within(adresses).getAllByRole('radio')).toHaveLength(2);
    expect(within(adresses).getByRole('radio', { name: /Le Tampon/ })).not.toBeChecked();
    await userEvent.selectOptions(screen.getByLabelText('Type d’intervention'), 'Débouchage');
    await userEvent.type(screen.getByLabelText('Description de la demande'), 'Fuite sous évier');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’intervention' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choisissez le client, puis l’adresse de l’intervention.',
    );
    expect(appels.creations).toHaveLength(0);

    await userEvent.click(screen.getByRole('radio', { name: /Saint-Pierre/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’intervention' }));
    await screen.findByLabelText('Liste');
    expect(appels.creations).toEqual([expect.objectContaining({ adresseId: 22 })]);
  });

  it('US14 : signale tout ce qui manque sans appeler l’API', async () => {
    const appels = simulerApi();
    afficher();

    await userEvent.click(await screen.findByRole('button', { name: 'Créer l’intervention' }));

    const alerte = screen.getByRole('alert');
    expect(within(alerte).getAllByRole('listitem')).toHaveLength(4);
    expect(alerte).toHaveTextContent('Décrivez la demande du client.');
    expect(appels.creations).toHaveLength(0);
  });

  it('US14 : refuse une recherche d’un caractère et indique qu’aucun client ne correspond', async () => {
    const appels = simulerApi([]);
    afficher();
    const champ = await screen.findByLabelText('Client');

    await userEvent.type(champ, 'd');
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Saisissez au moins 2 caractères pour rechercher un client.',
    );
    expect(appels.recherches).toHaveLength(0);

    await userEvent.type(champ, 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(
      await screen.findByText('Aucun client ne correspond à cette recherche.'),
    ).toBeInTheDocument();
  });

  it('US14 : permet de changer de client après l’avoir choisi', async () => {
    simulerApi();
    afficher();

    await choisirClient('dupont', 'Jean Dupont');
    await userEvent.click(screen.getByRole('button', { name: 'Changer de client' }));

    expect(screen.getByRole('search', { name: 'Rechercher un client' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /12 rue des Lilas/ })).not.toBeInTheDocument();
  });

  it('US14 : affiche le refus de l’API et reste sur le formulaire', async () => {
    simulerApi();
    serveurApi.use(
      http.post(urlApi('/interventions'), () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: ['Ce client est archivé : on ne peut plus lui rattacher d’intervention.'],
          },
          { status: 400 },
        ),
      ),
    );
    afficher();

    await choisirClient('dupont', 'Jean Dupont');
    await userEvent.selectOptions(screen.getByLabelText('Type d’intervention'), 'Débouchage');
    await userEvent.type(screen.getByLabelText('Description de la demande'), 'Évier bouché');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’intervention' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce client est archivé');
    expect(screen.getByRole('button', { name: 'Créer l’intervention' })).toBeEnabled();
    expect(screen.queryByLabelText('Liste')).not.toBeInTheDocument();
  });

  it('US14 : propose « Réessayer » si les types d’intervention ne se chargent pas', async () => {
    serveurApi.use(http.get(urlApi('/intervention-types'), () => HttpResponse.error()));
    afficher();

    const alerte = await screen.findByRole('alert');
    expect(within(alerte).getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
