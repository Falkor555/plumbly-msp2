import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { serveurApi, urlApi } from './test/msw/serveur';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('App (aiguillage provisoire en attendant le routeur de #9)', () => {
  it('affiche le planning du gestionnaire par défaut', async () => {
    serveurApi.use(
      http.get(urlApi('/tours'), () => HttpResponse.json({ du: '', au: '', techniciens: [] })),
    );

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Planning' })).toBeInTheDocument();
    expect(await screen.findByText('Aucun technicien actif.')).toBeInTheDocument();
  });

  it('affiche la tournée du technicien sur /ma-tournee', async () => {
    serveurApi.use(
      http.get(urlApi('/tours/me/today'), () => new HttpResponse(null, { status: 204 })),
    );
    window.history.replaceState(null, '', '/ma-tournee');

    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ma tournée du jour' }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Vous n'avez pas de tournée aujourd'hui.")).toBeInTheDocument();
  });
});
