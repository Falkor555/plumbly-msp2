import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { creerJeuDeDemonstration } from '../simulation/donneesDemonstration';
import { creerHandlersPlanning } from '../simulation/handlersPlanning';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PagePlanning } from './PagePlanning';

const LUNDI = '2026-11-23';

interface RequeteEnvoyee {
  methode: string;
  chemin: string;
  corps: unknown;
}

let ecritures: RequeteEnvoyee[];

beforeEach(() => {
  ecritures = [];
  serveurApi.use(
    ...creerHandlersPlanning(creerJeuDeDemonstration(LUNDI), { urlApi, aujourdhui: () => LUNDI }),
  );
  serveurApi.events.on('request:start', async ({ request }) => {
    if (request.method === 'GET') return;
    ecritures.push({
      methode: request.method,
      chemin: new URL(request.url).pathname.replace('/api/v1', ''),
      corps: await request.clone().json(),
    });
  });
  return () => serveurApi.events.removeAllListeners();
});

async function ouvrirAffectation(technicien: string, jour = 'lundi 23 novembre 2026') {
  const utilisateur = userEvent.setup();
  render(<PagePlanning aujourdhui={LUNDI} />);
  await utilisateur.click(
    await screen.findByRole('button', {
      name: `Affecter une intervention à ${technicien} le ${jour}`,
    }),
  );
  const fenetre = await screen.findByRole('dialog', { name: 'Affecter une intervention' });
  await within(fenetre).findByLabelText('Intervention à planifier');
  return { utilisateur, fenetre };
}

describe("affectation d'une intervention à une tournée", () => {
  it("crée la tournée du technicien qui n'en a pas, affecte l'intervention et l'affiche au planning", async () => {
    const { utilisateur, fenetre } = await ouvrirAffectation('Paul Lebon');
    expect(fenetre).toHaveTextContent('une tournée sera créée');

    await utilisateur.selectOptions(
      within(fenetre).getByLabelText('Intervention à planifier'),
      within(fenetre).getByRole('option', { name: /Mme Nativel/ }),
    );
    await utilisateur.clear(within(fenetre).getByLabelText('Heure de début'));
    await utilisateur.type(within(fenetre).getByLabelText('Heure de début'), '09:30');
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Affecter' }));

    expect(
      await screen.findByRole('article', { name: /09:30–10:30, Mme Nativel/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ecritures).toEqual([
      { methode: 'POST', chemin: '/tours', corps: { technicienId: 3, dateTournee: LUNDI } },
      {
        methode: 'POST',
        chemin: '/tours/1000/interventions',
        // 9 h 30 à La Réunion = 5 h 30 UTC.
        corps: { interventionId: 4, debutPrevu: '2026-11-23T05:30:00.000Z' },
      },
    ]);
  });

  it("affiche le conflit renvoyé par l'API et garde la fenêtre ouverte", async () => {
    const { utilisateur, fenetre } = await ouvrirAffectation('Jean Rivière');

    await utilisateur.selectOptions(
      within(fenetre).getByLabelText('Intervention à planifier'),
      within(fenetre).getByRole('option', { name: /Mme Nativel/ }),
    );
    await utilisateur.clear(within(fenetre).getByLabelText('Heure de début'));
    await utilisateur.type(within(fenetre).getByLabelText('Heure de début'), '08:30');
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Affecter' }));

    expect(await within(fenetre).findByRole('alert')).toHaveTextContent(
      "Ce créneau chevauche l'intervention n° 1 (08:00–09:00).",
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // La tournée existe déjà : elle n'est pas recréée.
    expect(ecritures.map(({ chemin }) => chemin)).toEqual(['/tours/10/interventions']);
  });

  it("ne recrée pas la tournée au nouvel essai quand l'affectation a échoué après sa création", async () => {
    serveurApi.use(
      http.post(
        urlApi('/tours/:id/interventions'),
        () =>
          HttpResponse.json(
            { statusCode: 400, message: 'Le créneau doit se terminer avant 19 h (RG11).' },
            { status: 400 },
          ),
        { once: true },
      ),
    );
    const { utilisateur, fenetre } = await ouvrirAffectation('Paul Lebon');
    await utilisateur.selectOptions(
      within(fenetre).getByLabelText('Intervention à planifier'),
      within(fenetre).getByRole('option', { name: /Mme Nativel/ }),
    );

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Affecter' }));
    expect(await within(fenetre).findByRole('alert')).toHaveTextContent('avant 19 h (RG11)');
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Affecter' }));

    expect(
      await screen.findByRole('article', { name: /08:00–09:00, Mme Nativel/ }),
    ).toBeInTheDocument();
    expect(ecritures.filter(({ chemin }) => chemin === '/tours')).toHaveLength(1);
  });

  it('ferme la fenêtre sans rien envoyer avec « Annuler » ou la touche Échap', async () => {
    const { utilisateur, fenetre } = await ouvrirAffectation('Jean Rivière');

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await utilisateur.click(
      screen.getByRole('button', {
        name: 'Affecter une intervention à Jean Rivière le mardi 24 novembre 2026',
      }),
    );
    await screen.findByRole('dialog');
    await utilisateur.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ecritures).toEqual([]);
  });

  it("prévient quand aucune intervention n'attend d'être planifiée", async () => {
    serveurApi.use(
      http.get(urlApi('/interventions'), () =>
        HttpResponse.json({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }),
      ),
    );
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await utilisateur.click(
      await screen.findByRole('button', {
        name: 'Affecter une intervention à Paul Lebon le lundi 23 novembre 2026',
      }),
    );

    const fenetre = await screen.findByRole('dialog');
    expect(
      await within(fenetre).findByText("Aucune intervention n'attend d'être planifiée."),
    ).toBeInTheDocument();
    expect(within(fenetre).getByRole('button', { name: 'Affecter' })).toBeDisabled();
  });

  it('ne demande que les interventions à planifier', async () => {
    const statutsDemandes: (string | null)[] = [];
    serveurApi.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/interventions'))
        statutsDemandes.push(url.searchParams.get('statut'));
    });

    await ouvrirAffectation('Paul Lebon');

    expect(statutsDemandes).toEqual(['A_PLANIFIER']);
  });
});
