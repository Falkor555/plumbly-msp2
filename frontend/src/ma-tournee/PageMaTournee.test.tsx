import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Tournee } from '../api/types';
import { fabriquerIntervention, planifier } from '../simulation/donneesDemonstration';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageMaTournee } from './PageMaTournee';

const JOUR = '2026-11-24';

function tourneeDuJour(): Tournee {
  const premiere = planifier(
    fabriquerIntervention({
      id: 1,
      client: 'Mme Hoarau',
      type: 'Recherche de fuite',
      ville: 'Saint-Denis',
      dureeEstimeeMin: 60,
    }),
    JOUR,
    '08:00',
    1,
  );
  const seconde = {
    ...planifier(
      fabriquerIntervention({
        id: 2,
        client: 'Boulangerie Grondin',
        typeClient: 'PROFESSIONNEL',
        type: 'Chauffe-eau',
        ville: 'Sainte-Marie',
        dureeEstimeeMin: 90,
        urgence: 'URGENTE',
      }),
      JOUR,
      '10:00',
      2,
    ),
    adresse: {
      id: 200,
      rue: '12 rue de Paris',
      complement: 'Bâtiment B',
      codePostal: '97438',
      ville: 'Sainte-Marie',
      infosAcces: 'Code portail 1234',
    },
  };
  return {
    id: 10,
    dateTournee: JOUR,
    technicien: {
      id: 1,
      nom: 'Rivière',
      prenom: 'Jean',
      telephone: '0692 11 11 11',
      couleurPlanning: '#0F766E',
    },
    interventions: [premiere, seconde],
  };
}

describe('ma tournée du jour (technicien)', () => {
  it("liste les interventions dans l'ordre de passage avec l'adresse et l'accès", async () => {
    serveurApi.use(http.get(urlApi('/tours/me/today'), () => HttpResponse.json(tourneeDuJour())));

    render(<PageMaTournee />);

    const etapes = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(etapes).toHaveLength(2);
    expect(screen.getByText("2 interventions, dans l'ordre de passage")).toBeInTheDocument();
    expect(etapes[0]).toHaveTextContent('Étape 1 : 08:00–09:00');
    expect(etapes[0]).toHaveTextContent('Mme Hoarau');
    expect(etapes[1]).toHaveTextContent('Étape 2 : 10:00–11:30');
    expect(etapes[1]).toHaveTextContent('Bâtiment B');
    expect(etapes[1]).toHaveTextContent('Code portail 1234');
    expect(within(etapes[1]).getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('mardi 24 novembre 2026')).toBeInTheDocument();
  });

  it('propose un lien pour appeler le client, sans espaces dans le numéro', async () => {
    serveurApi.use(http.get(urlApi('/tours/me/today'), () => HttpResponse.json(tourneeDuJour())));

    render(<PageMaTournee />);

    const liens = await screen.findAllByRole('link', { name: /Appeler le client/ });
    expect(liens[0]).toHaveAttribute('href', 'tel:0692123456');
  });

  it("indique qu'il n'y a pas de tournée quand l'API répond 204", async () => {
    serveurApi.use(
      http.get(urlApi('/tours/me/today'), () => new HttpResponse(null, { status: 204 })),
    );

    render(<PageMaTournee />);

    expect(await screen.findByText("Vous n'avez pas de tournée aujourd'hui.")).toBeInTheDocument();
  });

  it('indique une tournée créée mais encore vide', async () => {
    serveurApi.use(
      http.get(urlApi('/tours/me/today'), () =>
        HttpResponse.json({ ...tourneeDuJour(), interventions: [] }),
      ),
    );

    render(<PageMaTournee />);

    expect(
      await screen.findByText('Aucune intervention prévue pour le moment.'),
    ).toBeInTheDocument();
  });

  it('montre un message de droits sans détail technique quand le compte est refusé (403)', async () => {
    serveurApi.use(
      http.get(urlApi('/tours/me/today'), () =>
        HttpResponse.json({ statusCode: 403, message: 'Forbidden resource' }, { status: 403 }),
      ),
    );

    render(<PageMaTournee />);

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent("Vous n'avez pas les droits pour effectuer cette action.");
    expect(alerte).not.toHaveTextContent('Forbidden resource');
  });
});
