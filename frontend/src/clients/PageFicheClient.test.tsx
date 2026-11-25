import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Client, Intervention } from '../api/types';
import {
  fabriquerAdresse,
  fabriquerClient,
  heleneDeTest,
  interventionDeHelene,
  interventionPlanifieeDeHelene,
  listePaginee,
} from '../test/clientsDeTest';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageFicheClient } from './PageFicheClient';

const LUNDI = '2026-11-23';

/** Hélène Payet avec, en plus de ses deux adresses en service, une adresse archivée. */
function heleneAvecAdresseArchivee(): Client {
  const helene = heleneDeTest();
  return {
    ...helene,
    adresses: [
      ...helene.adresses,
      fabriquerAdresse({
        id: 72,
        rue: '8 impasse des Goyaviers',
        codePostal: '97490',
        ville: 'Sainte-Clotilde',
        archive: true,
        archiveLe: '2026-11-22T06:00:00.000Z',
      }),
    ],
  };
}

function servirLaFiche(client: Client): void {
  serveurApi.use(http.get(urlApi(`/clients/${client.id}`), () => HttpResponse.json(client)));
}

/**
 * Simule GET /clients/7/interventions : filtre sur les statuts reçus (séparés par des virgules),
 * pagine, et garde les paramètres de chaque requête.
 */
function servirLHistorique(interventions: Intervention[]): URLSearchParams[] {
  const recues: URLSearchParams[] = [];
  serveurApi.use(
    http.get(urlApi('/clients/7/interventions'), ({ request }) => {
      const parametres = new URL(request.url).searchParams;
      recues.push(parametres);
      const statuts = parametres.get('statut')?.split(',');
      const retenues = interventions.filter(({ statut }) => !statuts || statuts.includes(statut));
      const page = Number(parametres.get('page'));
      const limit = Number(parametres.get('limit'));
      return HttpResponse.json(
        listePaginee(retenues.slice((page - 1) * limit, page * limit), {
          page,
          limit,
          total: retenues.length,
          totalPages: Math.ceil(retenues.length / limit),
        }),
      );
    }),
  );
  return recues;
}

/** Dans l'ordre de l'API : de la plus récemment créée à la plus ancienne. */
function historiqueDeHelene(): Intervention[] {
  return [
    interventionDeHelene(31, 'Recherche de fuite'),
    interventionPlanifieeDeHelene(32, 'Débouchage', LUNDI, '08:00'),
    {
      ...interventionPlanifieeDeHelene(33, 'Entretien chaudière', '2026-11-16', '14:30'),
      statut: 'TERMINEE',
    },
  ];
}

function section(nom: string): HTMLElement {
  return screen.getByRole('region', { name: nom });
}

async function ouvrirLaFiche(client: Client = heleneAvecAdresseArchivee()): Promise<void> {
  servirLaFiche(client);
  render(<PageFicheClient id={client.id} />);
  await screen.findByRole('heading', { level: 1, name: client.nomAffiche });
}

describe('fiche client (US09)', () => {
  it('US09 : affiche le nom du client en titre et ses coordonnées', async () => {
    servirLHistorique([]);

    await ouvrirLaFiche();

    const coordonnees = section('Coordonnées');
    expect(within(coordonnees).getByText('Nom').nextSibling).toHaveTextContent('Payet');
    expect(within(coordonnees).getByText('Prénom').nextSibling).toHaveTextContent('Hélène');
    expect(within(coordonnees).getByRole('link', { name: '0692 12 34 56' })).toHaveAttribute(
      'href',
      'tel:0692123456',
    );
    expect(
      within(coordonnees).getByRole('link', { name: 'helene.payet@exemple.re' }),
    ).toHaveAttribute('href', 'mailto:helene.payet@exemple.re');
    expect(screen.getByRole('link', { name: 'Retour à la liste des clients' })).toHaveAttribute(
      'href',
      '/clients',
    );
    expect(screen.queryByText('Archivé')).not.toBeInTheDocument();
  });

  it('US09 : sépare les adresses en service des adresses archivées', async () => {
    servirLHistorique([]);

    await ouvrirLaFiche();

    const adresses = section('Adresses');
    const enService = within(adresses).getByRole('list', { name: 'En service (2)' });
    const archivees = within(adresses).getByRole('list', { name: 'Archivées (1)' });
    const [lilas, tamarins] = within(enService).getAllByRole('listitem');
    expect(lilas).toHaveTextContent('12 rue des Lilas');
    expect(lilas).toHaveTextContent('Bât. B');
    expect(lilas).toHaveTextContent('97400 Saint-Denis');
    expect(lilas).toHaveTextContent('Accès : Code 4521, 3e étage');
    expect(tamarins).toHaveTextContent('3 chemin des Tamarins');
    expect(within(archivees).getByRole('listitem')).toHaveTextContent(
      '8 impasse des Goyaviers97490 Sainte-ClotildeArchivée le 22/11/2026',
    );
  });

  it('US09 : n’affiche pas de rubrique « Archivées » sans adresse archivée', async () => {
    servirLHistorique([]);

    await ouvrirLaFiche(heleneDeTest());

    expect(within(section('Adresses')).queryByText(/^Archivées/)).not.toBeInTheDocument();
  });

  it('US09 : présente la raison sociale d’un professionnel, et « Non renseigné » pour ce qui manque', async () => {
    const boulangerie = fabriquerClient({
      id: 3,
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Boulangerie Técher',
      nomAffiche: 'Boulangerie Técher',
    });
    serveurApi.use(
      http.get(urlApi('/clients/3/interventions'), () => HttpResponse.json(listePaginee([]))),
    );

    await ouvrirLaFiche(boulangerie);

    const coordonnees = section('Coordonnées');
    expect(within(coordonnees).getByText('Raison sociale').nextSibling).toHaveTextContent(
      'Boulangerie Técher',
    );
    expect(within(coordonnees).getByText('Contact').nextSibling).toHaveTextContent('Non renseigné');
    expect(within(coordonnees).getByText('E-mail').nextSibling).toHaveTextContent('Non renseigné');
    const titre = screen.getByRole('heading', { level: 1, name: 'Boulangerie Técher' });
    expect(titre.parentElement).toHaveTextContent('Boulangerie TécherProfessionnel');
  });

  it('RG22 : signale un client archivé, dont la fiche reste consultable', async () => {
    servirLHistorique([]);

    await ouvrirLaFiche({
      ...heleneDeTest(),
      archive: true,
      archiveLe: '2026-11-24T05:00:00.000Z',
    });

    expect(screen.getByText('Archivé')).toBeInTheDocument();
    expect(screen.getByText(/^Client archivé le 24\/11\/2026/)).toBeInTheDocument();
  });

  it('US09 : une fiche introuvable affiche le message de l’API, et « Réessayer » la relit', async () => {
    const utilisateur = userEvent.setup();
    servirLaFiche(heleneDeTest());
    servirLHistorique([]);
    serveurApi.use(
      http.get(
        urlApi('/clients/7'),
        () =>
          HttpResponse.json({ statusCode: 404, message: 'Client introuvable.' }, { status: 404 }),
        { once: true },
      ),
    );
    render(<PageFicheClient id={7} />);

    const alerte = await screen.findByRole('alert');

    expect(alerte).toHaveTextContent("L'élément demandé est introuvable.");
    expect(screen.getByRole('heading', { level: 1, name: 'Fiche client' })).toBeInTheDocument();

    await utilisateur.click(within(alerte).getByRole('button', { name: 'Réessayer' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hélène Payet' }),
    ).toBeInTheDocument();
  });
});

describe('historique des interventions du client (US09)', () => {
  it('US09 : liste les interventions dans l’ordre de l’API, avec date, type, adresse, statut et technicien', async () => {
    const recues = servirLHistorique(historiqueDeHelene());

    await ouvrirLaFiche();

    const historique = section('Historique des interventions');
    const tableau = await within(historique).findByRole('table');
    const lignes = within(tableau).getAllByRole('row').slice(1);
    expect(
      lignes.map((ligne) =>
        within(ligne)
          .getAllByRole('cell')
          .map((cellule) => cellule.textContent),
      ),
    ).toEqual([
      [
        'Non planifiée',
        'Recherche de fuite',
        '12 rue des Lilas, 97400 Saint-Denis',
        'À planifier',
        'Non affecté',
      ],
      [
        '23/11/2026 08:00',
        'Débouchage',
        '12 rue des Lilas, 97400 Saint-Denis',
        'Planifiée',
        'Jean Rivière',
      ],
      [
        '16/11/2026 14:30',
        'Entretien chaudière',
        '12 rue des Lilas, 97400 Saint-Denis',
        'Terminée',
        'Jean Rivière',
      ],
    ]);
    expect(within(historique).getByText('3 interventions')).toBeInTheDocument();
    expect(Object.fromEntries(recues[0])).toEqual({ page: '1', limit: '10' });
  });

  it('US09 : pagine l’historique par 10 et demande la page suivante', async () => {
    const utilisateur = userEvent.setup();
    const interventions = Array.from({ length: 12 }, (_, rang) =>
      interventionDeHelene(100 + rang, `Intervention n°${rang + 1}`),
    );
    const recues = servirLHistorique(interventions);
    await ouvrirLaFiche();
    const historique = section('Historique des interventions');
    await within(historique).findByText('Intervention n°1');
    const pages = within(historique).getByRole('navigation', {
      name: 'Pages de l’historique des interventions',
    });

    expect(within(pages).getByText('Page 1 sur 2')).toBeInTheDocument();
    expect(within(pages).getByText('12 interventions')).toBeInTheDocument();

    await utilisateur.click(within(pages).getByRole('button', { name: 'Suivante' }));

    expect(await within(historique).findByText('Intervention n°11')).toBeInTheDocument();
    expect(within(historique).queryByText('Intervention n°1')).not.toBeInTheDocument();
    expect(recues.map((parametres) => parametres.get('page'))).toEqual(['1', '2']);
  });

  it('US09 : filtre par statut avec des cases à cocher, envoyées en un seul paramètre joint par des virgules', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLHistorique(historiqueDeHelene());
    await ouvrirLaFiche();
    const historique = section('Historique des interventions');
    await within(historique).findByText('Recherche de fuite');
    const filtre = within(historique).getByRole('group', { name: 'Filtrer par statut' });

    expect(within(filtre).getAllByRole('checkbox')).toHaveLength(5);
    expect(filtre).toHaveAccessibleDescription('Sans case cochée, tous les statuts sont affichés.');

    // Cochées dans le désordre : la requête suit l'ordre du cycle de vie.
    await utilisateur.click(within(filtre).getByRole('checkbox', { name: 'Terminée' }));
    await utilisateur.click(within(filtre).getByRole('checkbox', { name: 'Planifiée' }));

    // Chaque case relance une lecture. Seule la réponse aux deux cases montre Débouchage sans la
    // recherche de fuite : la liste complète a les deux, la réponse « Terminée » seule aucune.
    await waitFor(() => {
      expect(recues.at(-1)?.get('statut')).toBe('PLANIFIEE,TERMINEE');
      expect(within(historique).getByText('Débouchage')).toBeInTheDocument();
      expect(within(historique).queryByText('Recherche de fuite')).not.toBeInTheDocument();
    });
    expect(within(historique).getByText('Entretien chaudière')).toBeInTheDocument();

    await utilisateur.click(within(filtre).getByRole('checkbox', { name: 'Terminée' }));
    await utilisateur.click(within(filtre).getByRole('checkbox', { name: 'Planifiée' }));

    expect(await within(historique).findByText('Recherche de fuite')).toBeInTheDocument();
    expect(recues.at(-1)?.has('statut')).toBe(false);
  });

  it('US09 : cocher un statut depuis la page 2 revient à la page 1', async () => {
    const utilisateur = userEvent.setup();
    const interventions = Array.from({ length: 12 }, (_, rang) =>
      interventionDeHelene(100 + rang, `Intervention n°${rang + 1}`),
    );
    const recues = servirLHistorique(interventions);
    await ouvrirLaFiche();
    const historique = section('Historique des interventions');
    await within(historique).findByText('Intervention n°1');
    await utilisateur.click(within(historique).getByRole('button', { name: 'Suivante' }));
    await within(historique).findByText('Intervention n°11');

    await utilisateur.click(within(historique).getByRole('checkbox', { name: 'À planifier' }));

    expect(await within(historique).findByText('Intervention n°1')).toBeInTheDocument();
    expect(Object.fromEntries(recues.at(-1) ?? [])).toEqual({
      page: '1',
      limit: '10',
      statut: 'A_PLANIFIER',
    });
  });

  it('US09 : distingue un historique vide d’un filtre sans résultat', async () => {
    const utilisateur = userEvent.setup();
    servirLHistorique([interventionDeHelene(31, 'Recherche de fuite')]);
    await ouvrirLaFiche();
    const historique = section('Historique des interventions');
    await within(historique).findByText('Recherche de fuite');

    await utilisateur.click(within(historique).getByRole('checkbox', { name: 'Annulée' }));

    expect(
      await within(historique).findByText('Aucune intervention avec ces statuts.'),
    ).toBeInTheDocument();
  });

  it('US09 : indique un client sans intervention', async () => {
    servirLHistorique([]);

    await ouvrirLaFiche();

    expect(
      await within(section('Historique des interventions')).findByText(
        'Aucune intervention pour ce client.',
      ),
    ).toBeInTheDocument();
  });

  it('US09 : une erreur de l’historique s’affiche dans sa section, sans masquer la fiche', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLHistorique(historiqueDeHelene());
    serveurApi.use(
      http.get(urlApi('/clients/7/interventions'), () => HttpResponse.error(), { once: true }),
    );
    await ouvrirLaFiche();
    const historique = section('Historique des interventions');

    const alerte = await within(historique).findByRole('alert');

    expect(alerte).toHaveTextContent('Connexion au serveur impossible.');
    expect(section('Coordonnées')).toBeInTheDocument();

    await utilisateur.click(within(alerte).getByRole('button', { name: 'Réessayer' }));

    expect(await within(historique).findByText('Recherche de fuite')).toBeInTheDocument();
    expect(recues).toHaveLength(1);
    // Le bouton disparu avec l'alerte, le focus reste dans l'historique au lieu du document.
    expect(historique).toContainElement(document.activeElement as HTMLElement);
  });
});
