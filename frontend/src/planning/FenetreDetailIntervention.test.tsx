import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Intervention } from '../api/types';
import type { JeuDeDemonstration } from '../simulation/donneesDemonstration';
import { creerHandlersInterventions } from '../simulation/handlersInterventions';
import { IMAGE_PNG_DE_TEST } from '../test/canvas';
import { creerJeuDeTerrain, JOUR_DE_TERRAIN } from '../test/jeuDeTerrain';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { FenetreDetailIntervention } from './FenetreDetailIntervention';

let jeu: JeuDeDemonstration;
let lectures: string[];

beforeEach(() => {
  jeu = creerJeuDeTerrain();
  lectures = [];
  serveurApi.use(...creerHandlersInterventions(jeu, { urlApi, aujourdhui: () => JOUR_DE_TERRAIN }));
  serveurApi.events.on('request:start', ({ request }) => {
    lectures.push(new URL(request.url).pathname.replace('/api/v1', ''));
  });
  return () => serveurApi.events.removeAllListeners();
});

function intervention(rang: number): Intervention {
  return jeu.techniciens[0].tournees[0].interventions[rang];
}

function ouvrir(choisie: Intervention) {
  render(<FenetreDetailIntervention intervention={choisie} onFermer={vi.fn()} />);
  return screen.getByRole('dialog', { name: choisie.type.libelle });
}

describe('signature du client dans le détail du planning (US33)', () => {
  it('affiche l’image, le signataire, la date à La Réunion, le technicien et « Contenu intact »', async () => {
    const fenetre = ouvrir(intervention(0));

    const bloc = await within(fenetre).findByRole('region', { name: 'Signature du client' });

    const image = await within(bloc).findByRole('img', { name: 'Signature de Josiane Baret' });
    expect(image).toHaveAttribute('src', IMAGE_PNG_DE_TEST);
    expect(bloc).toHaveTextContent('Contenu intact');
    expect(bloc).toHaveTextContent('SignataireJosiane Baret');
    // 8 h 20 à La Réunion, quel que soit le fuseau du poste.
    expect(bloc).toHaveTextContent('lundi 23 novembre 2026 à 08:20');
    expect(bloc).toHaveTextContent('TechnicienJean Rivière');
    expect(lectures).toEqual(['/interventions/1/signature']);
  });

  it('signale un contenu modifié après la signature', async () => {
    jeu.signatures[1].integre = false;

    const fenetre = ouvrir(intervention(0));

    expect(await within(fenetre).findByText('Contenu modifié après signature')).toBeInTheDocument();
    expect(within(fenetre).queryByText('Contenu intact')).not.toBeInTheDocument();
  });

  it('ne charge rien et n’affiche pas de bloc pour une intervention non signée', async () => {
    const fenetre = ouvrir(intervention(1));

    // Laisse passer une éventuelle requête avant de conclure qu'il n'y en a pas.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(fenetre).queryByRole('region', { name: 'Signature du client' })).toBeNull();
    expect(lectures).toEqual([]);
  });

  it('garde le détail lisible si la signature ne peut pas être lue', async () => {
    serveurApi.use(
      http.get(
        urlApi('/interventions/:id/signature'),
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const fenetre = ouvrir(intervention(0));

    expect(await within(fenetre).findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Réessayez plus tard.',
    );
    expect(fenetre).toHaveTextContent('Mme Baret');
  });

  it('n’affiche pas une image qui n’est pas un PNG en data URL', async () => {
    jeu.signatures[1].image = 'https://exemple.test/piege.svg';

    const fenetre = ouvrir(intervention(0));

    expect(
      await within(fenetre).findByText('Image de la signature illisible.'),
    ).toBeInTheDocument();
    expect(within(fenetre).queryByRole('img')).not.toBeInTheDocument();
  });
});
