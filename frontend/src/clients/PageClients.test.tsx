import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Client } from '../api/types';
import { clientsDeTest, fabriquerClient, servirLesClients } from '../test/clientsDeTest';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageClients } from './PageClients';

/*
 * Minuteurs réels : le délai de frappe est de 300 ms et findBy attend jusqu'à 1 s. Les minuteurs
 * factices bloqueraient findBy et MSW.
 */

/** Les cinq clients en service, puis vingt autres : 25 en tout, sur deux pages de 20. */
function vingtCinqClients(): Client[] {
  const autres = Array.from({ length: 20 }, (_, rang) =>
    fabriquerClient({ id: 100 + rang, nomAffiche: `Client n°${rang + 1}` }),
  );
  return [...clientsDeTest(), ...autres];
}

function champRecherche(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Rechercher un client' });
}

function navigationDesPages(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Pages de la liste des clients' });
}

function ligneDe(nom: string): HTMLElement {
  return screen.getByRole('rowheader', { name: new RegExp(nom) }).closest('tr') as HTMLElement;
}

async function attendreLaListe(): Promise<void> {
  await screen.findByRole('link', { name: 'Hélène Payet' });
}

describe('liste des clients (US08)', () => {
  it('US08 : affiche les clients en service avec leur ville, leur téléphone et leur type', async () => {
    const recues = servirLesClients(clientsDeTest());

    render(<PageClients />);
    await attendreLaListe();

    expect(screen.getByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Clients : nom, ville, téléphone et type' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((entete) => entete.textContent)).toEqual([
      'Nom',
      'Ville',
      'Téléphone',
      'Type',
    ]);
    expect(screen.getAllByRole('rowheader')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Hélène Payet' })).toHaveAttribute(
      'href',
      '/clients/7',
    );
    const helene = within(ligneDe('Hélène Payet')).getAllByRole('cell');
    expect(helene.map((cellule) => cellule.textContent)).toEqual([
      'Saint-Denis',
      '0692 12 34 56',
      'Particulier',
    ]);
    expect(within(ligneDe('Boulangerie Técher')).getByText('Professionnel')).toBeInTheDocument();
    expect(screen.queryByText('Émile Nativel')).not.toBeInTheDocument();
    expect(within(navigationDesPages()).getByText('5 clients')).toBeInTheDocument();
    expect(within(navigationDesPages()).getByText('Page 1 sur 1')).toBeInTheDocument();
    expect(Object.fromEntries(recues[0])).toEqual({ tri: 'nomAffiche', page: '1', limit: '20' });
  });

  it('US08 : la recherche « helene » part une seule fois, après le délai de frappe, et retrouve Hélène Payet', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(clientsDeTest());
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.type(champRecherche(), 'helene');

    // Juste après la frappe, le délai n'est pas écoulé : aucune requête n'est partie.
    expect(recues).toHaveLength(1);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Gérard Hoarau' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Hélène Payet' })).toBeInTheDocument();
    expect(recues.map((parametres) => parametres.get('recherche'))).toEqual([null, 'helene']);
    expect(recues[1].get('page')).toBe('1');
    // Le nombre de résultats est un message de statut, lu par le lecteur d'écran (RGAA 7.5).
    expect(within(navigationDesPages()).getByRole('status')).toHaveTextContent('1 client');
  });

  it('US08 : une recherche d’un seul caractère, même entouré d’espaces, n’interroge pas l’API', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(clientsDeTest());
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.type(champRecherche(), ' h ');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(recues).toHaveLength(1);
    expect(recues[0].has('recherche')).toBe(false);
    expect(screen.getAllByRole('rowheader')).toHaveLength(5);
  });

  it('US08 : garde la liste affichée pendant la recherche, sans repasser par « Chargement »', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    const rechercheRecue = vi.fn();
    // Passé devant servirLesClients : retient la recherche, puis la lui laisse.
    serveurApi.use(
      http.get(urlApi('/clients'), async ({ request }) => {
        if (!new URL(request.url).searchParams.has('recherche')) return;
        rechercheRecue();
        await reponseRetenue;
      }),
    );
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.type(champRecherche(), 'helene');
    await vi.waitFor(() => expect(rechercheRecue).toHaveBeenCalledTimes(1));

    expect(screen.getAllByRole('rowheader')).toHaveLength(5);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Chargement des clients…')).not.toBeInTheDocument();

    liberer();

    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(1));
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  });

  it('US08 : pagine par 20 et demande la page 2 puis la page 1 avec Suivante et Précédente', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(vingtCinqClients());
    render(<PageClients />);
    await attendreLaListe();
    const pages = navigationDesPages();

    expect(screen.getAllByRole('rowheader')).toHaveLength(20);
    expect(within(pages).getByText('25 clients')).toBeInTheDocument();
    expect(within(pages).getByText('Page 1 sur 2')).toBeInTheDocument();
    expect(within(pages).getByRole('button', { name: 'Précédente' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await utilisateur.click(within(pages).getByRole('button', { name: 'Suivante' }));

    expect(await screen.findByRole('link', { name: 'Client n°16' })).toBeInTheDocument();
    expect(screen.getAllByRole('rowheader')).toHaveLength(5);
    expect(screen.queryByRole('link', { name: 'Hélène Payet' })).not.toBeInTheDocument();
    expect(within(navigationDesPages()).getByText('Page 2 sur 2')).toBeInTheDocument();
    expect(within(navigationDesPages()).getByRole('button', { name: 'Suivante' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await utilisateur.click(
      within(navigationDesPages()).getByRole('button', { name: 'Précédente' }),
    );

    await attendreLaListe();
    expect(within(navigationDesPages()).getByText('Page 1 sur 2')).toBeInTheDocument();
    expect(recues.map((parametres) => parametres.get('page'))).toEqual(['1', '2', '1']);
  });

  it('US08 : un bouton de page inactif ne demande rien', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(vingtCinqClients());
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.click(
      within(navigationDesPages()).getByRole('button', { name: 'Précédente' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(recues).toHaveLength(1);
    expect(within(navigationDesPages()).getByText('Page 1 sur 2')).toBeInTheDocument();
  });

  it('US08 : au clavier, « Suivante » garde le focus pendant la lecture et une fois sur la dernière page', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(vingtCinqClients());
    render(<PageClients />);
    await attendreLaListe();
    within(navigationDesPages()).getByRole('button', { name: 'Suivante' }).focus();

    await utilisateur.keyboard('{Enter}');

    expect(within(navigationDesPages()).getByRole('button', { name: 'Suivante' })).toHaveFocus();
    await screen.findByRole('link', { name: 'Client n°16' });
    const suivante = within(navigationDesPages()).getByRole('button', { name: 'Suivante' });
    expect(suivante).toHaveAttribute('aria-disabled', 'true');
    expect(suivante).toHaveFocus();
  });

  it('US08 : revenir à la recherche d’origine après en avoir essayé une autre reste en page 1', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(vingtCinqClients());
    render(<PageClients />);
    await attendreLaListe();
    await utilisateur.click(within(navigationDesPages()).getByRole('button', { name: 'Suivante' }));
    await screen.findByRole('link', { name: 'Client n°16' });
    await utilisateur.type(champRecherche(), 'xy');
    await screen.findByText('Aucun client ne correspond à ces critères.');

    await utilisateur.clear(champRecherche());

    await waitFor(() => expect(recues).toHaveLength(4));
    expect(recues[3].has('recherche')).toBe(false);
    expect(recues[3].get('page')).toBe('1');
    expect(await screen.findByText('Page 1 sur 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hélène Payet' })).toBeInTheDocument();
  });

  it.each([
    [
      'le type',
      async (utilisateur: ReturnType<typeof userEvent.setup>) =>
        utilisateur.selectOptions(screen.getByLabelText('Type de client'), 'Professionnel'),
      { typeClient: 'PROFESSIONNEL' },
    ],
    [
      'le tri',
      async (utilisateur: ReturnType<typeof userEvent.setup>) =>
        utilisateur.selectOptions(screen.getByLabelText('Trier par'), 'Les plus récents d’abord'),
      { tri: '-creeLe' },
    ],
    [
      'la case des archivés',
      async (utilisateur: ReturnType<typeof userEvent.setup>) =>
        utilisateur.click(screen.getByRole('checkbox', { name: 'Inclure les archivés' })),
      { archives: 'true' },
    ],
    [
      'la recherche',
      async (utilisateur: ReturnType<typeof userEvent.setup>) =>
        utilisateur.type(champRecherche(), 'client'),
      { recherche: 'client' },
    ],
  ])(
    'US08 : changer %s depuis la page 2 revient à la page 1',
    async (_filtre, changer, attendu) => {
      const utilisateur = userEvent.setup();
      const recues = servirLesClients(vingtCinqClients());
      render(<PageClients />);
      await attendreLaListe();
      await utilisateur.click(
        within(navigationDesPages()).getByRole('button', { name: 'Suivante' }),
      );
      await screen.findByRole('link', { name: 'Client n°16' });

      await changer(utilisateur);

      await waitFor(() => expect(recues).toHaveLength(3));
      expect(Object.fromEntries(recues[2])).toMatchObject({ ...attendu, page: '1' });
      await waitFor(() =>
        expect(within(navigationDesPages()).getByText(/^Page 1 sur/)).toBeInTheDocument(),
      );
    },
  );

  it('US08 : « Inclure les archivés » envoie archives=true et signale le client archivé', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(clientsDeTest());
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Inclure les archivés' }));

    expect(await screen.findByRole('link', { name: 'Émile Nativel' })).toBeInTheDocument();
    expect(within(ligneDe('Émile Nativel')).getByText('Archivé')).toBeInTheDocument();
    expect(within(ligneDe('Hélène Payet')).queryByText('Archivé')).not.toBeInTheDocument();
    expect(recues.at(-1)?.get('archives')).toBe('true');

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Inclure les archivés' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Émile Nativel' })).not.toBeInTheDocument(),
    );
    expect(recues.at(-1)?.has('archives')).toBe(false);
  });

  it('US08 : envoie telle quelle une saisie à caractères spéciaux et affiche simplement « aucun client »', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(clientsDeTest());
    render(<PageClients />);
    await attendreLaListe();

    await utilisateur.type(champRecherche(), "' OR 1=1 --");

    expect(await screen.findByText('Aucun client ne correspond à ces critères.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(recues.at(-1)?.get('recherche')).toBe("' OR 1=1 --");
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('US08 : limite la recherche à 100 caractères et explique ce qu’elle couvre', async () => {
    servirLesClients(clientsDeTest());
    render(<PageClients />);
    await attendreLaListe();

    expect(champRecherche()).toHaveAttribute('maxLength', '100');
    expect(champRecherche()).toHaveAccessibleDescription(
      'Nom, téléphone ou ville, au moins 2 caractères.',
    );
  });

  it('US08 : indique une liste vide quand aucun client n’est enregistré', async () => {
    servirLesClients([]);

    render(<PageClients />);

    expect(await screen.findByText('Aucun client enregistré pour le moment.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('US08 : partant d’une liste vide, n’annonce « aucun client » pour une recherche qu’une fois sa réponse reçue', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients([]);
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    const rechercheRecue = vi.fn();
    serveurApi.use(
      http.get(urlApi('/clients'), async ({ request }) => {
        if (!new URL(request.url).searchParams.has('recherche')) return;
        rechercheRecue();
        await reponseRetenue;
      }),
    );
    render(<PageClients />);
    await screen.findByText('Aucun client enregistré pour le moment.');

    await utilisateur.type(champRecherche(), 'he');
    await vi.waitFor(() => expect(rechercheRecue).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('status')).toHaveTextContent('Chargement des clients…');
    expect(
      screen.queryByText('Aucun client ne correspond à ces critères.'),
    ).not.toBeInTheDocument();

    liberer();

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Aucun client ne correspond à ces critères.',
    );
  });

  it('US08 : une panne réseau affiche une alerte, puis « Réessayer » relit la liste', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(clientsDeTest());
    serveurApi.use(http.get(urlApi('/clients'), () => HttpResponse.error(), { once: true }));
    render(<PageClients />);

    const alerte = await screen.findByRole('alert');

    expect(alerte).toHaveTextContent(
      'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await utilisateur.click(within(alerte).getByRole('button', { name: 'Réessayer' }));

    await attendreLaListe();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(recues).toHaveLength(1);
    // Le bouton a disparu avec l'alerte : le focus reste juste avant la liste relue.
    expect(document.body).not.toHaveFocus();
    await utilisateur.tab();
    expect(within(screen.getByRole('table')).getAllByRole('link')[0]).toHaveFocus();
  });

  it('US08 : une erreur du serveur affiche un message générique, sans détail technique', async () => {
    serveurApi.use(
      http.get(urlApi('/clients'), () =>
        HttpResponse.json({ statusCode: 500, message: 'stack trace' }, { status: 500 }),
      ),
    );

    render(<PageClients />);

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Une erreur est survenue. Réessayez plus tard.');
    expect(alerte).not.toHaveTextContent('stack trace');
  });
});
