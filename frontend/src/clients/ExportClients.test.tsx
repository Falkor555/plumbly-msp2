import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { clientsDeTest, servirLesClients } from '../test/clientsDeTest';
import { enregistrerLesRequetes, parametresRecus } from '../test/msw/requetesRecues';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageClients } from './PageClients';

/*
 * US32 : export de la liste des clients depuis la page. Minuteurs réels : la recherche part après
 * 300 ms de délai de frappe, que findBy et waitFor attendent.
 */

const NOM_DU_FICHIER = 'clients-2026-11-25.csv';

function reponseCsv(): Response {
  return HttpResponse.text('﻿id;type_client;nom\r\n7;PARTICULIER;Payet\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${NOM_DU_FICHIER}"`,
      'Cache-Control': 'no-store',
    },
  });
}

interface LienClique {
  href: string;
  download: string;
}

// jsdom ne sait pas naviguer : le clic est remplacé par un relevé du lien au moment du clic.
function espionnerLesClics(): LienClique[] {
  const liens: LienClique[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    liens.push({ href: this.href, download: this.download });
  });
  return liens;
}

function boutonExporter(): HTMLElement {
  return screen.getByRole('button', { name: /^Export/ });
}

async function attendreLaListe(): Promise<void> {
  await screen.findByRole('link', { name: 'Hélène Payet' });
}

describe('export des clients en CSV (US32)', () => {
  it('US32 : exporte avec la recherche, le type, les archivés et le tri affichés, sans page ni limit, puis propose le fichier', async () => {
    const utilisateur = userEvent.setup();
    const liens = espionnerLesClics();
    const libererAdresse = vi.spyOn(URL, 'revokeObjectURL');
    const lectures = servirLesClients(clientsDeTest());
    const exports = enregistrerLesRequetes('get', '/clients/export', reponseCsv);
    render(<PageClients />);
    await attendreLaListe();
    await utilisateur.selectOptions(screen.getByLabelText('Type de client'), 'Particulier');
    await utilisateur.selectOptions(screen.getByLabelText('Trier par'), 'Les plus récents d’abord');
    await utilisateur.click(screen.getByRole('checkbox', { name: 'Inclure les archivés' }));
    await utilisateur.type(
      screen.getByRole('searchbox', { name: 'Rechercher un client' }),
      ' helene ',
    );
    // La recherche ne compte qu'une fois appliquée à la liste, après le délai de frappe.
    await waitFor(() => expect(lectures.at(-1)?.get('recherche')).toBe('helene'));
    await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false'));

    await utilisateur.click(screen.getByRole('button', { name: 'Exporter en CSV' }));

    expect(
      await screen.findByText(
        `Export prêt : le téléchargement de « ${NOM_DU_FICHIER} » a commencé.`,
      ),
    ).toBeInTheDocument();
    expect(exports).toHaveLength(1);
    expect(parametresRecus(exports[0])).toEqual({
      recherche: 'helene',
      typeClient: 'PARTICULIER',
      archives: 'true',
      tri: '-creeLe',
    });
    expect(liens).toHaveLength(1);
    expect(liens[0].download).toBe(NOM_DU_FICHIER);
    expect(liens[0].href).toMatch(/^blob:/);
    expect(libererAdresse).toHaveBeenCalledWith(liens[0].href);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(boutonExporter()).toHaveTextContent('Exporter en CSV');
    expect(boutonExporter()).not.toHaveAttribute('aria-disabled');
  });

  it('US32 : sans filtre, n’envoie que le tri par défaut', async () => {
    const utilisateur = userEvent.setup();
    espionnerLesClics();
    servirLesClients(clientsDeTest());
    const exports = enregistrerLesRequetes('get', '/clients/export', reponseCsv);
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.click(screen.getByRole('button', { name: 'Exporter en CSV' }));

    await screen.findByText(/^Export prêt/);
    expect(parametresRecus(exports[0])).toEqual({ tri: 'nomAffiche' });
  });

  it('US32 : pendant le téléchargement, le bouton est inactif, garde le focus et un second clic ne relance rien', async () => {
    const utilisateur = userEvent.setup();
    espionnerLesClics();
    servirLesClients(clientsDeTest());
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    const demandes = vi.fn();
    serveurApi.use(
      http.get(urlApi('/clients/export'), async () => {
        demandes();
        await reponseRetenue;
        return reponseCsv();
      }),
    );
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.click(screen.getByRole('button', { name: 'Exporter en CSV' }));

    const bouton = screen.getByRole('button', { name: 'Export en cours…' });
    expect(bouton).toHaveAttribute('aria-disabled', 'true');
    expect(bouton).toHaveFocus();
    await utilisateur.click(bouton);
    liberer();
    await screen.findByText(/^Export prêt/);
    expect(demandes).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Exporter en CSV' })).toHaveFocus();
  });

  it('US32 : le refus d’un export de plus de 5 000 lignes s’affiche tel quel, sans fichier', async () => {
    const utilisateur = userEvent.setup();
    const liens = espionnerLesClics();
    servirLesClients(clientsDeTest());
    const message = 'L’export dépasse 5 000 lignes : affinez les filtres.';
    enregistrerLesRequetes('get', '/clients/export', () =>
      HttpResponse.json({ statusCode: 400, message, error: 'Bad Request' }, { status: 400 }),
    );
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.click(screen.getByRole('button', { name: 'Exporter en CSV' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe(message);
    expect(liens).toHaveLength(0);
    expect(screen.queryByText(/^Export prêt/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporter en CSV' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('US32 : le refus de l’export disparaît dès que l’utilisateur affine les filtres', async () => {
    const utilisateur = userEvent.setup();
    espionnerLesClics();
    servirLesClients(clientsDeTest());
    const message = 'L’export dépasse 5 000 lignes : affinez les filtres.';
    const exports = enregistrerLesRequetes('get', '/clients/export', () =>
      HttpResponse.json({ statusCode: 400, message, error: 'Bad Request' }, { status: 400 }),
    );
    render(<PageClients />);
    await attendreLaListe();
    await utilisateur.click(screen.getByRole('button', { name: 'Exporter en CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);

    await utilisateur.selectOptions(screen.getByLabelText('Type de client'), 'Particulier');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(exports).toHaveLength(1);
  });

  it('US32 : une erreur du serveur affiche un message générique, effacé au nouvel essai réussi', async () => {
    const utilisateur = userEvent.setup();
    espionnerLesClics();
    servirLesClients(clientsDeTest());
    enregistrerLesRequetes('get', '/clients/export', reponseCsv);
    serveurApi.use(
      http.get(
        urlApi('/clients/export'),
        () => HttpResponse.json({ statusCode: 500, message: 'stack trace' }, { status: 500 }),
        { once: true },
      ),
    );
    render(<PageClients />);
    await attendreLaListe();
    await utilisateur.click(screen.getByRole('button', { name: 'Exporter en CSV' }));
    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Une erreur est survenue. Réessayez plus tard.');
    expect(alerte).not.toHaveTextContent('stack trace');

    await utilisateur.click(screen.getByRole('button', { name: 'Exporter en CSV' }));

    await screen.findByText(/^Export prêt/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
