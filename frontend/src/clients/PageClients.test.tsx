import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Client } from '../api/types';
import {
  clientsDeTest,
  fabriquerClient,
  listePaginee,
  servirLesClients,
} from '../test/clientsDeTest';
import { enregistrerLesRequetes } from '../test/msw/requetesRecues';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { afficherALAdresse } from '../test/routeur';
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

/** Région live du nombre de clients, montée en permanence, même sans liste affichée. */
function zoneDuTotal(): HTMLElement {
  return screen.getByRole('status', { name: 'Nombre de clients' });
}

/** Message de liste vide affiché à l'écran, hors de la zone du total qui en porte le même texte. */
function messageAffiche(texte: string): Promise<HTMLElement> {
  return screen.findByText(texte, { ignore: 'script, style, .sr-only' });
}

/** Message de chargement : les deux autres statuts de la page sont nommés, lui ne l'est pas. */
function messageDeChargement(): HTMLElement {
  return screen.getByRole('status', { name: '' });
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

    afficherALAdresse(<PageClients />, '/clients');
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
    afficherALAdresse(<PageClients />, '/clients');
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
    expect(zoneDuTotal()).toHaveTextContent('1 client');
    expect(within(navigationDesPages()).getByText('1 client')).toBeInTheDocument();
  });

  it('US08 : partant d’une liste vide, annonce le total d’une recherche dans la zone de statut déjà présente', async () => {
    const utilisateur = userEvent.setup();
    const trouves = clientsDeTest().slice(0, 3);
    serveurApi.use(
      http.get(urlApi('/clients'), ({ request }) => {
        const avecRecherche = new URL(request.url).searchParams.has('recherche');
        return HttpResponse.json(listePaginee(avecRecherche ? trouves : []));
      }),
    );
    afficherALAdresse(<PageClients />, '/clients');
    await messageAffiche('Aucun client enregistré pour le moment.');
    // Capturée avant la recherche : une région insérée avec son texte ne serait pas lue.
    const zone = zoneDuTotal();
    expect(zone).toHaveTextContent('Aucun client enregistré pour le moment.');
    expect(zone).toHaveAttribute('aria-live', 'polite');

    await utilisateur.type(champRecherche(), 'saint');

    await waitFor(() => expect(zone).toHaveTextContent('3 clients'));
    expect(zoneDuTotal()).toBe(zone);
    expect(screen.getAllByRole('rowheader')).toHaveLength(3);
  });

  it('US08 : partant d’une liste de clients, annonce une recherche sans résultat dans la zone de statut déjà présente', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const zone = zoneDuTotal();
    expect(zone).toHaveTextContent('5 clients');

    await utilisateur.type(champRecherche(), 'zzz');

    await waitFor(() =>
      expect(zone).toHaveTextContent('Aucun client ne correspond à ces critères.'),
    );
    expect(zoneDuTotal()).toBe(zone);
    expect(await messageAffiche('Aucun client ne correspond à ces critères.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('US08 : une recherche qui retrouve le même total l’annonce de nouveau, la zone se vidant pendant la lecture', async () => {
    const utilisateur = userEvent.setup();
    const trouves = clientsDeTest().slice(0, 3);
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    const rechercheRecue = vi.fn();
    serveurApi.use(
      http.get(urlApi('/clients'), async ({ request }) => {
        if (new URL(request.url).searchParams.has('recherche')) {
          rechercheRecue();
          await reponseRetenue;
        }
        return HttpResponse.json(listePaginee(trouves));
      }),
    );
    afficherALAdresse(<PageClients />, '/clients');
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(3));
    const zone = zoneDuTotal();
    expect(zone).toHaveTextContent('3 clients');

    await utilisateur.type(champRecherche(), 'saint');
    await vi.waitFor(() => expect(rechercheRecue).toHaveBeenCalledTimes(1));

    // Le tableau précédent reste affiché, mais le total n'est plus celui des critères en cours.
    expect(zone).toBeEmptyDOMElement();
    expect(screen.getAllByRole('rowheader')).toHaveLength(3);

    liberer();

    await waitFor(() => expect(zone).toHaveTextContent('3 clients'));
    expect(zoneDuTotal()).toBe(zone);
  });

  it('US08 : une relecture en échec vide la zone du total au lieu d’annoncer un total périmé', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    serveurApi.use(
      http.get(urlApi('/clients'), ({ request }) =>
        new URL(request.url).searchParams.has('recherche') ? HttpResponse.error() : undefined,
      ),
    );
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const zone = zoneDuTotal();
    expect(zone).toHaveTextContent('5 clients');

    await utilisateur.type(champRecherche(), 'he');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.',
    );
    expect(zone).toBeEmptyDOMElement();
    expect(zoneDuTotal()).toBe(zone);
  });

  it('US08 : une recherche d’un seul caractère, même entouré d’espaces, n’interroge pas l’API', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(clientsDeTest());
    afficherALAdresse(<PageClients />, '/clients');
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
    afficherALAdresse(<PageClients />, '/clients');
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
    afficherALAdresse(<PageClients />, '/clients');
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
    afficherALAdresse(<PageClients />, '/clients');
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
    afficherALAdresse(<PageClients />, '/clients');
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
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    await utilisateur.click(within(navigationDesPages()).getByRole('button', { name: 'Suivante' }));
    await screen.findByRole('link', { name: 'Client n°16' });
    await utilisateur.type(champRecherche(), 'xy');
    await messageAffiche('Aucun client ne correspond à ces critères.');

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
      afficherALAdresse(<PageClients />, '/clients');
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
    afficherALAdresse(<PageClients />, '/clients');
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
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();

    await utilisateur.type(champRecherche(), "' OR 1=1 --");

    expect(await messageAffiche('Aucun client ne correspond à ces critères.')).toBeInTheDocument();
    expect(zoneDuTotal()).toHaveTextContent('Aucun client ne correspond à ces critères.');
    expect(recues.at(-1)?.get('recherche')).toBe("' OR 1=1 --");
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('US08 : limite la recherche à 100 caractères et explique ce qu’elle couvre', async () => {
    servirLesClients(clientsDeTest());
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();

    expect(champRecherche()).toHaveAttribute('maxLength', '100');
    expect(champRecherche()).toHaveAccessibleDescription(
      'Nom, téléphone ou ville, au moins 2 caractères.',
    );
  });

  it('US08 : indique une liste vide quand aucun client n’est enregistré', async () => {
    servirLesClients([]);

    afficherALAdresse(<PageClients />, '/clients');

    expect(await messageAffiche('Aucun client enregistré pour le moment.')).toBeInTheDocument();
    expect(zoneDuTotal()).toHaveTextContent('Aucun client enregistré pour le moment.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('US08 : une liste vide, archivés inclus et sans recherche, dit qu’aucun client n’est enregistré', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients([]);
    afficherALAdresse(<PageClients />, '/clients');
    await messageAffiche('Aucun client enregistré pour le moment.');

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Inclure les archivés' }));

    // La zone du total, vidée par la nouvelle lecture, ne reprend un texte qu'à sa réponse.
    await waitFor(() => expect(recues).toHaveLength(2));
    expect(recues[1].get('archives')).toBe('true');
    // Les archivés élargissent la liste : vide, elle ne compte aucun client, en service ou non.
    await waitFor(() =>
      expect(zoneDuTotal()).toHaveTextContent('Aucun client enregistré pour le moment.'),
    );
    expect(await messageAffiche('Aucun client enregistré pour le moment.')).toBeInTheDocument();
    expect(
      screen.queryByText('Aucun client ne correspond à ces critères.'),
    ).not.toBeInTheDocument();
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
    afficherALAdresse(<PageClients />, '/clients');
    await messageAffiche('Aucun client enregistré pour le moment.');
    const zone = zoneDuTotal();

    await utilisateur.type(champRecherche(), 'he');
    await vi.waitFor(() => expect(rechercheRecue).toHaveBeenCalledTimes(1));

    expect(messageDeChargement()).toHaveTextContent('Chargement des clients…');
    expect(zone).toBeEmptyDOMElement();
    expect(
      screen.queryByText('Aucun client ne correspond à ces critères.'),
    ).not.toBeInTheDocument();

    liberer();

    await waitFor(() =>
      expect(zone).toHaveTextContent('Aucun client ne correspond à ces critères.'),
    );
    expect(await messageAffiche('Aucun client ne correspond à ces critères.')).toBeInTheDocument();
    expect(screen.queryByText('Chargement des clients…')).not.toBeInTheDocument();
    expect(zoneDuTotal()).toBe(zone);
  });

  it('US08 : une panne réseau affiche une alerte, puis « Réessayer » relit la liste', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesClients(clientsDeTest());
    serveurApi.use(http.get(urlApi('/clients'), () => HttpResponse.error(), { once: true }));
    afficherALAdresse(<PageClients />, '/clients');

    const alerte = await screen.findByRole('alert');

    expect(alerte).toHaveTextContent(
      'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // La zone du total reste dans la page pendant l'erreur, vide, pour annoncer la liste relue.
    const zone = zoneDuTotal();
    expect(zone).toBeEmptyDOMElement();

    await utilisateur.click(within(alerte).getByRole('button', { name: 'Réessayer' }));

    await attendreLaListe();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(recues).toHaveLength(1);
    expect(zoneDuTotal()).toBe(zone);
    expect(zone).toHaveTextContent('5 clients');
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

    afficherALAdresse(<PageClients />, '/clients');

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Une erreur est survenue. Réessayez plus tard.');
    expect(alerte).not.toHaveTextContent('stack trace');
  });
});

type Utilisateur = ReturnType<typeof userEvent.setup>;

function champ(fenetre: HTMLElement, nom: string): HTMLElement {
  return within(fenetre).getByRole('textbox', { name: nom });
}

async function ouvrirLaCreation(utilisateur: Utilisateur): Promise<HTMLElement> {
  await utilisateur.click(screen.getByRole('button', { name: 'Nouveau client' }));
  return screen.getByRole('dialog', { name: 'Nouveau client' });
}

/** Téléphone et adresse valides, sans nom : le seul manque d'un particulier. */
async function remplirSansLeNom(utilisateur: Utilisateur, fenetre: HTMLElement): Promise<void> {
  await utilisateur.type(champ(fenetre, 'Téléphone (obligatoire)'), '0692 11 22 33');
  await utilisateur.type(champ(fenetre, 'Rue (obligatoire)'), '5 rue de Paris');
  await utilisateur.type(champ(fenetre, 'Code postal (obligatoire)'), '97400');
  await utilisateur.type(champ(fenetre, 'Ville (obligatoire)'), 'Saint-Denis');
}

function marieTecher(): Client {
  return fabriquerClient({
    id: 42,
    nomClient: 'Técher',
    prenomClient: 'Marie',
    nomAffiche: 'Marie Técher',
    telephone: '0692112233',
  });
}

/** Libellés des champs marqués en erreur, dans l'ordre de la fenêtre. */
function champsEnErreur(fenetre: HTMLElement): string[] {
  return within(fenetre)
    .getAllByRole('textbox')
    .filter((element) => element.getAttribute('aria-invalid') === 'true')
    .map((element) => (element as HTMLInputElement).labels?.[0]?.textContent ?? '');
}

describe('création d’un client (US06, US07)', () => {
  it('US06 : un particulier sans nom est signalé sur le champ sans appel à l’API, puis créé une fois le nom saisi', async () => {
    const utilisateur = userEvent.setup();
    const clients = clientsDeTest();
    const lectures = servirLesClients(clients);
    const creations = enregistrerLesRequetes('post', '/clients', () => {
      clients.push(marieTecher());
      return HttpResponse.json(marieTecher(), { status: 201 });
    });
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    // La région live doit exister, vide, avant le message : sinon il risque de ne pas être lu.
    const zoneDAnnonce = screen.getByRole('status', { name: 'Confirmation' });
    expect(zoneDAnnonce).toBeEmptyDOMElement();
    expect(zoneDAnnonce).toHaveAttribute('aria-atomic', 'true');
    const fenetre = await ouvrirLaCreation(utilisateur);
    expect(within(fenetre).getByRole('radio', { name: 'Particulier' })).toBeChecked();
    expect(within(fenetre).getByRole('radio', { name: 'Particulier' })).toHaveFocus();
    await utilisateur.type(champ(fenetre, 'Prénom'), 'Marie');
    await remplirSansLeNom(utilisateur, fenetre);

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));

    const nom = champ(fenetre, 'Nom (obligatoire)');
    expect(nom).toHaveAttribute('aria-invalid', 'true');
    expect(nom).toHaveAccessibleDescription(
      'Saisissez le nom : il est obligatoire pour un particulier.',
    );
    await waitFor(() => expect(nom).toHaveFocus());
    expect(within(fenetre).getByRole('alert')).toHaveTextContent(
      'Un champ est à corriger : son message est affiché sous lui.',
    );
    expect(creations).toHaveLength(0);

    await utilisateur.type(nom, 'Técher');
    expect(nom).not.toHaveAttribute('aria-invalid');
    expect(within(fenetre).queryByRole('alert')).not.toBeInTheDocument();
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(creations).toHaveLength(1);
    // Ni e-mail, ni complément, ni accès : l'API refuse une chaîne vide (400).
    expect(JSON.parse(creations[0].corps)).toEqual({
      typeClient: 'PARTICULIER',
      nomClient: 'Técher',
      prenomClient: 'Marie',
      telephone: '0692112233',
      adresse: { rue: '5 rue de Paris', codePostal: '97400', ville: 'Saint-Denis' },
    });
    const annonce = screen.getByText(/^Client « Marie Técher » créé\./);
    expect(zoneDAnnonce).toContainElement(annonce);
    expect(within(annonce).getByRole('link', { name: 'Ouvrir sa fiche' })).toHaveAttribute(
      'href',
      '/clients/42',
    );
    expect(await screen.findByRole('link', { name: 'Marie Técher' })).toHaveAttribute(
      'href',
      '/clients/42',
    );
    expect(lectures).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Nouveau client' })).toHaveFocus();
  });

  it('US07 : un professionnel exige la raison sociale ; le nom devient celui du contact, facultatif', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const creations = enregistrerLesRequetes('post', '/clients', () =>
      HttpResponse.json(marieTecher(), { status: 201 }),
    );
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const fenetre = await ouvrirLaCreation(utilisateur);
    expect(within(fenetre).queryByRole('textbox', { name: /^Raison sociale/ })).toBeNull();

    await utilisateur.click(within(fenetre).getByRole('radio', { name: 'Professionnel' }));
    await remplirSansLeNom(utilisateur, fenetre);
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));

    const raisonSociale = champ(fenetre, 'Raison sociale (obligatoire)');
    expect(raisonSociale).toHaveAttribute('aria-invalid', 'true');
    expect(raisonSociale).toHaveAccessibleDescription(
      'Saisissez la raison sociale : elle est obligatoire pour un professionnel.',
    );
    await waitFor(() => expect(raisonSociale).toHaveFocus());
    expect(champsEnErreur(fenetre)).toEqual(['Raison sociale (obligatoire)']);
    expect(champ(fenetre, 'Nom du contact')).toBeInTheDocument();
    expect(within(fenetre).getByRole('group', { name: 'Type de client' })).toBeInTheDocument();
    expect(creations).toHaveLength(0);
  });

  it('US06 : plusieurs champs en erreur sont tous signalés, le focus allant au premier', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const fenetre = await ouvrirLaCreation(utilisateur);
    await utilisateur.type(champ(fenetre, 'Téléphone (obligatoire)'), '0692-11');
    await utilisateur.type(champ(fenetre, 'E-mail'), 'marie@exemple');

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));

    expect(champsEnErreur(fenetre)).toEqual([
      'Nom (obligatoire)',
      'Téléphone (obligatoire)',
      'E-mail',
      'Rue (obligatoire)',
      'Code postal (obligatoire)',
      'Ville (obligatoire)',
    ]);
    expect(champ(fenetre, 'Téléphone (obligatoire)')).toHaveAccessibleDescription(
      '10 chiffres commençant par 0 ; espaces et points acceptés. Le téléphone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés), par exemple 0692 12 34 56.',
    );
    await waitFor(() => expect(champ(fenetre, 'Nom (obligatoire)')).toHaveFocus());
    expect(within(fenetre).getByRole('alert')).toHaveTextContent(
      '6 champs sont à corriger : chaque message est affiché sous son champ.',
    );
  });

  it('US06 : un refus de l’API à plusieurs messages s’affiche tel quel, ligne par ligne, et la fenêtre reste ouverte', async () => {
    const utilisateur = userEvent.setup();
    const lectures = servirLesClients(clientsDeTest());
    const messages = [
      'nomClient contient un caractère non autorisé',
      'adresse.rue contient un caractère non autorisé',
    ];
    serveurApi.use(
      http.post(urlApi('/clients'), () =>
        HttpResponse.json(
          { statusCode: 400, message: messages, error: 'Bad Request' },
          { status: 400 },
        ),
      ),
    );
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const fenetre = await ouvrirLaCreation(utilisateur);
    await utilisateur.type(champ(fenetre, 'Nom (obligatoire)'), 'Técher');
    await remplirSansLeNom(utilisateur, fenetre);

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe(messages.join('\n'));
    expect(alerte).toHaveClass('whitespace-pre-line');
    expect(screen.getByRole('dialog', { name: 'Nouveau client' })).toBeInTheDocument();
    expect(within(fenetre).getByRole('button', { name: 'Créer le client' })).toBeEnabled();
    expect(within(fenetre).getByRole('button', { name: 'Créer le client' })).toHaveFocus();
    expect(champ(fenetre, 'Nom (obligatoire)')).toHaveValue('Técher');
    expect(lectures).toHaveLength(1);
  });

  it('US06 : après un refus de l’API, le focus revient sur « Créer le client » une fois l’envoi terminé', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    serveurApi.use(
      http.post(urlApi('/clients'), async () => {
        await reponseRetenue;
        return HttpResponse.json(
          { statusCode: 400, message: 'telephone doit être unique', error: 'Bad Request' },
          { status: 400 },
        );
      }),
    );
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const fenetre = await ouvrirLaCreation(utilisateur);
    await utilisateur.type(champ(fenetre, 'Nom (obligatoire)'), 'Técher');
    await remplirSansLeNom(utilisateur, fenetre);
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));
    // Un navigateur retire le focus d'un bouton qui devient désactivé ; jsdom ne le fait pas.
    (document.activeElement as HTMLElement).blur();

    await utilisateur.tab();
    expect(fenetre).toHaveFocus();
    liberer();

    expect(await within(fenetre).findByRole('alert')).toHaveTextContent(
      'telephone doit être unique',
    );
    await waitFor(() =>
      expect(within(fenetre).getByRole('button', { name: 'Créer le client' })).toHaveFocus(),
    );
  });

  it('US06 : le résumé garde le nombre de champs refusés pendant la saisie et se réannonce à chaque envoi refusé', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const fenetre = await ouvrirLaCreation(utilisateur);
    await utilisateur.type(champ(fenetre, 'Rue (obligatoire)'), '5 rue de Paris');
    await utilisateur.type(champ(fenetre, 'Ville (obligatoire)'), 'Saint-Denis');
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));
    const premiereAlerte = within(fenetre).getByRole('alert');
    expect(premiereAlerte).toHaveTextContent('3 champs sont à corriger');

    await utilisateur.type(champ(fenetre, 'Nom (obligatoire)'), 'Técher');

    // Le texte ne change pas à chaque correction : l'alerte n'interrompt pas la saisie.
    expect(within(fenetre).getByRole('alert')).toBe(premiereAlerte);
    expect(premiereAlerte).toHaveTextContent('3 champs sont à corriger');
    await utilisateur.clear(champ(fenetre, 'Nom (obligatoire)'));
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));
    // Même nombre au second refus : une nouvelle alerte, pour qu'il soit de nouveau annoncé.
    const secondeAlerte = within(fenetre).getByRole('alert');
    expect(secondeAlerte).not.toBe(premiereAlerte);
    expect(secondeAlerte).toHaveTextContent('3 champs sont à corriger');
  });

  it('US06 : pendant l’envoi, le bouton est désactivé et dit que la création est en cours', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    const envoi = vi.fn();
    serveurApi.use(
      http.post(urlApi('/clients'), async () => {
        envoi();
        await reponseRetenue;
        return HttpResponse.json(marieTecher(), { status: 201 });
      }),
    );
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const fenetre = await ouvrirLaCreation(utilisateur);
    await utilisateur.type(champ(fenetre, 'Nom (obligatoire)'), 'Técher');
    await remplirSansLeNom(utilisateur, fenetre);

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Créer le client' }));

    expect(within(fenetre).getByRole('button', { name: 'Création en cours…' })).toBeDisabled();
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(champ(fenetre, 'Nom (obligatoire)')).toBeDisabled();
    await utilisateur.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Nouveau client' })).toBeInTheDocument();

    liberer();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(envoi).toHaveBeenCalledTimes(1);
  });

  it('US06 : « Annuler » ferme la fenêtre sans rien envoyer et rend le focus au bouton', async () => {
    const utilisateur = userEvent.setup();
    const lectures = servirLesClients(clientsDeTest());
    const creations = enregistrerLesRequetes('post', '/clients', () =>
      HttpResponse.json(marieTecher(), { status: 201 }),
    );
    afficherALAdresse(<PageClients />, '/clients');
    await attendreLaListe();
    const fenetre = await ouvrirLaCreation(utilisateur);
    // Identité et adresse côte à côte : la fenêtre de création est la large.
    expect(fenetre).toHaveClass('max-w-3xl');
    await utilisateur.type(champ(fenetre, 'Nom (obligatoire)'), 'Técher');

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouveau client' })).toHaveFocus();
    expect(creations).toHaveLength(0);
    expect(lectures).toHaveLength(1);
    expect(screen.queryByText(/créé\./)).not.toBeInTheDocument();
  });
});
