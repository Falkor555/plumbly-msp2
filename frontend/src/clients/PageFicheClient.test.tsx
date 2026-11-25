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
import { enregistrerLesRequetes, type RequeteRecue } from '../test/msw/requetesRecues';
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

/** Région live du nombre d'interventions, montée avec l'historique même quand il est vide. */
function zoneDuTotal(historique: HTMLElement): HTMLElement {
  return within(historique).getByRole('status', { name: 'Nombre d’interventions' });
}

/** Message d'historique vide affiché à l'écran, hors de la zone du total qui en porte le texte. */
function messageAffiche(historique: HTMLElement, texte: string): Promise<HTMLElement> {
  return within(historique).findByText(texte, { ignore: 'script, style, .sr-only' });
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
    const pages = within(historique).getByRole('navigation', {
      name: 'Pages de l’historique des interventions',
    });
    expect(within(pages).getByText('3 interventions')).toBeInTheDocument();
    expect(zoneDuTotal(historique)).toHaveTextContent('3 interventions');
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
      await messageAffiche(historique, 'Aucune intervention avec ces statuts.'),
    ).toBeInTheDocument();
    expect(zoneDuTotal(historique)).toHaveTextContent('Aucune intervention avec ces statuts.');
  });

  it('US09 : annonce dans une zone restée en place le filtre qui vide l’historique puis celui qui le remplit', async () => {
    const utilisateur = userEvent.setup();
    servirLHistorique(historiqueDeHelene());
    await ouvrirLaFiche();
    const historique = section('Historique des interventions');
    await within(historique).findByText('Recherche de fuite');
    const zone = zoneDuTotal(historique);
    expect(zone).toHaveTextContent('3 interventions');
    await utilisateur.click(within(historique).getByRole('checkbox', { name: 'Annulée' }));
    await messageAffiche(historique, 'Aucune intervention avec ces statuts.');
    expect(zone).toHaveTextContent('Aucune intervention avec ces statuts.');

    await utilisateur.click(within(historique).getByRole('checkbox', { name: 'Terminée' }));

    await waitFor(() => expect(zone).toHaveTextContent('1 intervention'));
    expect(zoneDuTotal(historique)).toBe(zone);
    expect(within(historique).getByText('Entretien chaudière')).toBeInTheDocument();
  });

  it('US09 : indique un client sans intervention', async () => {
    servirLHistorique([]);

    await ouvrirLaFiche();

    const historique = section('Historique des interventions');
    expect(
      await messageAffiche(historique, 'Aucune intervention pour ce client.'),
    ).toBeInTheDocument();
    expect(zoneDuTotal(historique)).toHaveTextContent('Aucune intervention pour ce client.');
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

const MESSAGE_INTERVENTIONS_ACTIVES =
  'Impossible d’archiver ce client tant qu’il a des interventions à planifier, planifiées ou en cours (2 actuellement) : terminez-les ou annulez-les d’abord.';

interface FicheModifiable {
  lectures: RequeteRecue[];
  /** La fiche que renverront les lectures suivantes, après une écriture simulée. */
  remplacer: (client: Client) => void;
}

/** Ouvre la fiche du client 7 ; chaque lecture est gardée, pour compter la relecture. */
async function ouvrirLaFicheModifiable(depart: Client = heleneDeTest()): Promise<FicheModifiable> {
  let courante = depart;
  servirLHistorique([]);
  const lectures = enregistrerLesRequetes('get', '/clients/7', () => HttpResponse.json(courante));
  render(<PageFicheClient id={7} />);
  await screen.findByRole('heading', { level: 1, name: depart.nomAffiche });
  return {
    lectures,
    remplacer: (client) => {
      courante = client;
    },
  };
}

function heleneAvecUneSeuleAdresse(): Client {
  const helene = heleneDeTest();
  return { ...helene, adresses: [helene.adresses[0]] };
}

function champ(fenetre: HTMLElement, nom: string): HTMLElement {
  return within(fenetre).getByRole('textbox', { name: nom });
}

function bouton(nom: string): HTMLElement {
  return screen.getByRole('button', { name: nom });
}

/** Région live des messages de succès, présente (vide) dès l'affichage de la fiche. */
function zoneDAnnonce(): HTMLElement {
  return screen.getByRole('status', { name: 'Confirmation' });
}

describe('modification des coordonnées (US10)', () => {
  it('US10 : n’envoie que le champ changé, null pour l’e-mail effacé, puis relit la fiche', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFicheModifiable();
    const modifications = enregistrerLesRequetes('patch', '/clients/7', () => {
      const modifiee = { ...heleneDeTest(), emailClient: null };
      remplacer(modifiee);
      return HttpResponse.json(modifiee);
    });
    await utilisateur.click(bouton('Modifier les coordonnées'));
    const fenetre = screen.getByRole('dialog', { name: 'Modifier les coordonnées' });
    expect(champ(fenetre, 'Nom (obligatoire)')).toHaveValue('Payet');
    expect(champ(fenetre, 'Téléphone (obligatoire)')).toHaveValue('0692123456');
    // Les adresses se gèrent à part : la modification n'en demande aucune, en fenêtre ordinaire.
    expect(within(fenetre).queryByRole('textbox', { name: /^Rue/ })).toBeNull();
    expect(fenetre).toHaveClass('max-w-lg');
    expect(zoneDAnnonce()).toBeEmptyDOMElement();

    await utilisateur.clear(champ(fenetre, 'E-mail'));
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(modifications).toHaveLength(1);
    expect(JSON.parse(modifications[0].corps)).toEqual({ emailClient: null });
    await waitFor(() =>
      expect(within(section('Coordonnées')).getByText('E-mail').nextSibling).toHaveTextContent(
        'Non renseigné',
      ),
    );
    expect(lectures).toHaveLength(2);
    expect(bouton('Modifier les coordonnées')).toHaveFocus();
    expect(zoneDAnnonce()).toHaveTextContent('Coordonnées enregistrées.');
  });

  it('US10 : un refus 400 de l’API s’affiche tel quel, la fenêtre reste ouverte et la fiche n’est pas relue', async () => {
    const utilisateur = userEvent.setup();
    const message = 'Ce client est archivé : il ne peut plus être modifié.';
    const { lectures } = await ouvrirLaFicheModifiable();
    serveurApi.use(
      http.patch(urlApi('/clients/7'), () =>
        HttpResponse.json({ statusCode: 400, message, error: 'Bad Request' }, { status: 400 }),
      ),
    );
    await utilisateur.click(bouton('Modifier les coordonnées'));
    const fenetre = screen.getByRole('dialog', { name: 'Modifier les coordonnées' });
    await utilisateur.clear(champ(fenetre, 'E-mail'));

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe(message);
    expect(screen.getByRole('dialog', { name: 'Modifier les coordonnées' })).toBeInTheDocument();
    expect(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    ).toHaveFocus();
    expect(champ(fenetre, 'E-mail')).toHaveValue('');
    expect(lectures).toHaveLength(1);
    expect(zoneDAnnonce()).toBeEmptyDOMElement();
  });

  it('US10 : enregistrer sans rien changer ferme la fenêtre sans appeler l’API', async () => {
    const utilisateur = userEvent.setup();
    // Aucun PATCH simulé : un envoi ferait échouer le test (requête non simulée).
    const { lectures } = await ouvrirLaFicheModifiable();
    await utilisateur.click(bouton('Modifier les coordonnées'));
    const fenetre = screen.getByRole('dialog', { name: 'Modifier les coordonnées' });

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(lectures).toHaveLength(1);
  });

  it('US10 : vider le nom d’un particulier est signalé sur le champ, sans appel à l’API', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFicheModifiable();
    await utilisateur.click(bouton('Modifier les coordonnées'));
    const fenetre = screen.getByRole('dialog', { name: 'Modifier les coordonnées' });

    await utilisateur.clear(champ(fenetre, 'Nom (obligatoire)'));
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    expect(champ(fenetre, 'Nom (obligatoire)')).toHaveAccessibleDescription(
      'Saisissez le nom : il est obligatoire pour un particulier.',
    );
    await waitFor(() => expect(champ(fenetre, 'Nom (obligatoire)')).toHaveFocus());
  });
});

describe('adresses du client (US07, RG21)', () => {
  it('US07 : « Ajouter une adresse » envoie l’adresse sans ses champs vides, puis relit la fiche', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFicheModifiable();
    const nouvelle = fabriquerAdresse({
      id: 73,
      rue: '9 allée des Songes',
      codePostal: '97490',
      ville: 'Sainte-Clotilde',
    });
    const ajouts = enregistrerLesRequetes('post', '/clients/7/addresses', () => {
      remplacer({ ...heleneDeTest(), adresses: [...heleneDeTest().adresses, nouvelle] });
      return HttpResponse.json(nouvelle, { status: 201 });
    });
    await utilisateur.click(bouton('Ajouter une adresse'));
    const fenetre = screen.getByRole('dialog', { name: 'Ajouter une adresse' });
    expect(champ(fenetre, 'Rue (obligatoire)')).toHaveFocus();

    await utilisateur.type(champ(fenetre, 'Rue (obligatoire)'), '9 allée des Songes');
    await utilisateur.type(champ(fenetre, 'Code postal (obligatoire)'), '97490');
    await utilisateur.type(champ(fenetre, 'Ville (obligatoire)'), 'Sainte-Clotilde');
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Ajouter l’adresse' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(ajouts[0].corps)).toEqual({
      rue: '9 allée des Songes',
      codePostal: '97490',
      ville: 'Sainte-Clotilde',
    });
    expect(
      await within(section('Adresses')).findByRole('list', { name: 'En service (3)' }),
    ).toHaveTextContent('9 allée des Songes');
    expect(lectures).toHaveLength(2);
    expect(zoneDAnnonce()).toHaveTextContent('Adresse ajoutée.');
  });

  it('US07 : un refus 400 à plusieurs messages s’affiche tel quel, ligne par ligne, et la fenêtre reste ouverte', async () => {
    const utilisateur = userEvent.setup();
    const messages = [
      'rue contient un caractère non autorisé',
      'ville contient un caractère non autorisé',
    ];
    const { lectures } = await ouvrirLaFicheModifiable();
    const ajouts = enregistrerLesRequetes('post', '/clients/7/addresses', () =>
      HttpResponse.json(
        { statusCode: 400, message: messages, error: 'Bad Request' },
        { status: 400 },
      ),
    );
    await utilisateur.click(bouton('Ajouter une adresse'));
    const fenetre = screen.getByRole('dialog', { name: 'Ajouter une adresse' });
    await utilisateur.type(champ(fenetre, 'Rue (obligatoire)'), '9 allée des Songes');
    await utilisateur.type(champ(fenetre, 'Code postal (obligatoire)'), '97490');
    await utilisateur.type(champ(fenetre, 'Ville (obligatoire)'), 'Sainte-Clotilde');

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Ajouter l’adresse' }));

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe(messages.join('\n'));
    expect(alerte).toHaveClass('whitespace-pre-line');
    expect(screen.getByRole('dialog', { name: 'Ajouter une adresse' })).toBeInTheDocument();
    expect(within(fenetre).getByRole('button', { name: 'Ajouter l’adresse' })).toHaveFocus();
    expect(ajouts).toHaveLength(1);
    expect(lectures).toHaveLength(1);
  });

  it('US07 : une adresse sans code postal valide n’est pas envoyée', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFicheModifiable();
    await utilisateur.click(bouton('Ajouter une adresse'));
    const fenetre = screen.getByRole('dialog', { name: 'Ajouter une adresse' });
    await utilisateur.type(champ(fenetre, 'Rue (obligatoire)'), '9 allée des Songes');
    await utilisateur.type(champ(fenetre, 'Code postal (obligatoire)'), '974');
    await utilisateur.type(champ(fenetre, 'Ville (obligatoire)'), 'Sainte-Clotilde');

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Ajouter l’adresse' }));

    const codePostal = champ(fenetre, 'Code postal (obligatoire)');
    expect(codePostal).toHaveAttribute('aria-invalid', 'true');
    expect(codePostal).toHaveAccessibleDescription(
      'Le code postal doit contenir 5 chiffres, par exemple 97400.',
    );
    await waitFor(() => expect(codePostal).toHaveFocus());
    expect(codePostal).toHaveAttribute('maxlength', '5');
  });

  it('US07 : « Corriger » n’envoie que le changement, null pour le complément effacé', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFicheModifiable();
    const corrections = enregistrerLesRequetes('patch', '/clients/7/addresses/70', () => {
      const helene = heleneDeTest();
      const corrigee = { ...helene.adresses[0], complement: null };
      remplacer({ ...helene, adresses: [corrigee, helene.adresses[1]] });
      return HttpResponse.json(corrigee);
    });
    await utilisateur.click(bouton('Corriger l’adresse 12 rue des Lilas'));
    const fenetre = screen.getByRole('dialog', { name: 'Corriger l’adresse' });
    expect(champ(fenetre, 'Complément d’adresse')).toHaveValue('Bât. B');
    expect(fenetre).toHaveTextContent('Pour un déménagement, ajoutez plutôt une nouvelle adresse');

    await utilisateur.clear(champ(fenetre, 'Complément d’adresse'));
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer la correction' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(corrections[0].corps)).toEqual({ complement: null });
    await waitFor(() => expect(lectures).toHaveLength(2));
    await waitFor(() => expect(section('Adresses')).not.toHaveTextContent('Bât. B'));
    expect(zoneDAnnonce()).toHaveTextContent('Adresse corrigée.');
  });

  it('RG21 : sur la dernière adresse en service, « Archiver » est inactif et dit pourquoi', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFicheModifiable(heleneAvecUneSeuleAdresse());
    const archiver = bouton('Archiver l’adresse 12 rue des Lilas');

    expect(archiver).toHaveAttribute('aria-disabled', 'true');
    expect(archiver).toHaveAccessibleDescription(
      'Dernière adresse en service : ajoutez-en une autre avant de l’archiver.',
    );

    await utilisateur.click(archiver);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bouton('Corriger l’adresse 12 rue des Lilas')).toBeEnabled();
  });

  it('US07 : archiver une adresse demande confirmation, appelle l’API, puis la range dans les archivées', async () => {
    const utilisateur = userEvent.setup();
    const { remplacer } = await ouvrirLaFicheModifiable();
    const archivages = enregistrerLesRequetes('post', '/clients/7/addresses/71/archive', () => {
      const helene = heleneDeTest();
      const archivee = {
        ...helene.adresses[1],
        archive: true,
        archiveLe: '2026-11-25T06:00:00.000Z',
      };
      remplacer({ ...helene, adresses: [helene.adresses[0], archivee] });
      return HttpResponse.json(archivee);
    });
    const archiver = bouton('Archiver l’adresse 3 chemin des Tamarins');
    expect(archiver).not.toHaveAttribute('aria-disabled');

    await utilisateur.click(archiver);
    const fenetre = screen.getByRole('dialog', { name: 'Archiver l’adresse ?' });
    expect(fenetre).toHaveTextContent('« 3 chemin des Tamarins, 97430 Le Tampon »');
    expect(fenetre).toHaveTextContent('L’archivage est définitif : il ne peut pas être annulé.');
    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Archiver l’adresse' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(archivages).toHaveLength(1);
    expect(archivages[0].corps).toBe('');
    const archivees = await within(section('Adresses')).findByRole('list', {
      name: 'Archivées (1)',
    });
    expect(archivees).toHaveTextContent('3 chemin des Tamarins');
    // Le bouton d'origine a disparu : le focus passe sur le titre de la section.
    expect(screen.getByRole('heading', { level: 2, name: 'Adresses' })).toHaveFocus();
    expect(bouton('Archiver l’adresse 12 rue des Lilas')).toHaveAttribute('aria-disabled', 'true');
    expect(zoneDAnnonce()).toHaveTextContent('Adresse archivée.');
  });

  it('US07 : le refus 409 d’une adresse encore utilisée s’affiche tel quel dans la confirmation', async () => {
    const utilisateur = userEvent.setup();
    const message =
      'Impossible d’archiver cette adresse tant qu’elle a des interventions à planifier, planifiées ou en cours (1 actuellement) : terminez-les ou annulez-les d’abord.';
    await ouvrirLaFicheModifiable();
    serveurApi.use(
      http.post(urlApi('/clients/7/addresses/71/archive'), () =>
        HttpResponse.json({ statusCode: 409, message, error: 'Conflict' }, { status: 409 }),
      ),
    );
    await utilisateur.click(bouton('Archiver l’adresse 3 chemin des Tamarins'));
    const fenetre = screen.getByRole('dialog', { name: 'Archiver l’adresse ?' });

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Archiver l’adresse' }));

    expect(await within(fenetre).findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('dialog', { name: 'Archiver l’adresse ?' })).toBeInTheDocument();
    // Le focus revient sur l'action sans risque, pas sur un nouvel essai voué au même refus.
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toHaveFocus();
  });
});

describe('archivage du client (US10, RG22)', () => {
  it('US10 : demande confirmation ; « Annuler » n’appelle rien et rend le focus au bouton', async () => {
    const utilisateur = userEvent.setup();
    const { lectures } = await ouvrirLaFicheModifiable();
    const archivages = enregistrerLesRequetes('post', '/clients/7/archive', () =>
      HttpResponse.json(heleneDeTest()),
    );

    await utilisateur.click(bouton('Archiver le client'));

    const fenetre = screen.getByRole('dialog', { name: 'Archiver le client ?' });
    expect(fenetre).toHaveTextContent(
      '« Hélène Payet » n’apparaîtra plus dans les listes ni les recherches.',
    );
    expect(fenetre).toHaveTextContent('L’archivage est définitif : il ne peut pas être annulé.');
    // Le focus allant sur « Annuler », le message n'est lu que s'il décrit la fenêtre.
    expect(fenetre).toHaveAccessibleDescription(
      /L’archivage est définitif : il ne peut pas être annulé\.$/,
    );
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toHaveFocus();

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bouton('Archiver le client')).toHaveFocus();
    expect(archivages).toHaveLength(0);
    expect(lectures).toHaveLength(1);
  });

  it('US10 : « Archiver définitivement » appelle POST /clients/7/archive ; la fiche relue est en lecture seule', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFicheModifiable();
    const archive = { ...heleneDeTest(), archive: true, archiveLe: '2026-11-25T06:00:00.000Z' };
    const archivages = enregistrerLesRequetes('post', '/clients/7/archive', () => {
      remplacer(archive);
      return HttpResponse.json(archive);
    });
    await utilisateur.click(bouton('Archiver le client'));
    const fenetre = screen.getByRole('dialog', { name: 'Archiver le client ?' });

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Archiver définitivement' }),
    );

    expect(await screen.findByText('Archivé')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(archivages).toHaveLength(1);
    expect(archivages[0].corps).toBe('');
    expect(lectures).toHaveLength(2);
    expect(screen.getByText(/^Client archivé le 25\/11\/2026/)).toBeInTheDocument();
    for (const nom of [
      'Archiver le client',
      'Modifier les coordonnées',
      'Ajouter une adresse',
      /^Corriger/,
      /^Archiver/,
    ]) {
      expect(screen.queryByRole('button', { name: nom })).not.toBeInTheDocument();
    }
    // Le bouton d'origine a disparu : le focus passe sur le nom du client.
    expect(screen.getByRole('heading', { level: 1, name: 'Hélène Payet' })).toHaveFocus();
    expect(zoneDAnnonce()).toHaveTextContent(
      'Client archivé : sa fiche est désormais en lecture seule.',
    );
  });

  it('US10 : tant que la fiche archivée n’est pas relue, « Archiver le client » est inactif et n’ouvre rien', async () => {
    const utilisateur = userEvent.setup();
    servirLHistorique([]);
    const archive = { ...heleneDeTest(), archive: true, archiveLe: '2026-11-25T06:00:00.000Z' };
    let courante: Client = heleneDeTest();
    let liberer: () => void = () => undefined;
    const relectureRetenue = new Promise<void>((resolve) => (liberer = resolve));
    serveurApi.use(
      http.get(urlApi('/clients/7'), async () => {
        if (courante.archive) await relectureRetenue;
        return HttpResponse.json(courante);
      }),
    );
    const archivages = enregistrerLesRequetes('post', '/clients/7/archive', () => {
      courante = archive;
      return HttpResponse.json(archive);
    });
    render(<PageFicheClient id={7} />);
    await screen.findByRole('heading', { level: 1, name: 'Hélène Payet' });
    await utilisateur.click(bouton('Archiver le client'));
    await utilisateur.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Archiver définitivement' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(bouton('Archiver le client')).toHaveFocus();
    expect(bouton('Archiver le client')).toHaveAttribute('aria-disabled', 'true');
    expect(bouton('Archiver l’adresse 3 chemin des Tamarins')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await utilisateur.keyboard('{Enter}');
    await utilisateur.click(bouton('Modifier les coordonnées'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    liberer();
    expect(await screen.findByText('Archivé')).toBeInTheDocument();
    expect(archivages).toHaveLength(1);
  });

  it('US10 : le refus 409 (interventions actives) s’affiche tel quel, et la fenêtre reste ouverte', async () => {
    const utilisateur = userEvent.setup();
    const { lectures } = await ouvrirLaFicheModifiable();
    serveurApi.use(
      http.post(urlApi('/clients/7/archive'), () =>
        HttpResponse.json(
          { statusCode: 409, message: MESSAGE_INTERVENTIONS_ACTIVES, error: 'Conflict' },
          { status: 409 },
        ),
      ),
    );
    await utilisateur.click(bouton('Archiver le client'));
    const fenetre = screen.getByRole('dialog', { name: 'Archiver le client ?' });

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Archiver définitivement' }),
    );

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe(MESSAGE_INTERVENTIONS_ACTIVES);
    expect(within(fenetre).getByRole('button', { name: 'Archiver définitivement' })).toBeEnabled();
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toBeEnabled();
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    expect(lectures).toHaveLength(1);
    expect(screen.queryByText('Archivé')).not.toBeInTheDocument();
  });

  it('US10 : Échap ferme la confirmation et rend le focus au bouton', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFicheModifiable();
    await utilisateur.click(bouton('Archiver le client'));
    expect(screen.getByRole('dialog', { name: 'Archiver le client ?' })).toBeInTheDocument();

    await utilisateur.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bouton('Archiver le client')).toHaveFocus();
  });

  it('US10 : pendant l’archivage, les deux boutons sont désactivés et Échap ne ferme pas', async () => {
    const utilisateur = userEvent.setup();
    const { remplacer } = await ouvrirLaFicheModifiable();
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    const archive = { ...heleneDeTest(), archive: true, archiveLe: '2026-11-25T06:00:00.000Z' };
    serveurApi.use(
      http.post(urlApi('/clients/7/archive'), async () => {
        await reponseRetenue;
        remplacer(archive);
        return HttpResponse.json(archive);
      }),
    );
    await utilisateur.click(bouton('Archiver le client'));
    const fenetre = screen.getByRole('dialog', { name: 'Archiver le client ?' });

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Archiver définitivement' }),
    );

    expect(within(fenetre).getByRole('button', { name: 'Archivage en cours…' })).toBeDisabled();
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await utilisateur.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Archiver le client ?' })).toBeInTheDocument();
    // Un navigateur retire le focus d'un bouton qui devient désactivé ; jsdom ne le fait pas.
    (document.activeElement as HTMLElement).blur();
    await utilisateur.tab();
    // Tout est désactivé : Tab reste dans la fenêtre au lieu de gagner la page derrière le voile.
    expect(fenetre).toHaveFocus();

    liberer();

    expect(await screen.findByText('Archivé')).toBeInTheDocument();
  });

  it('RG22 : un client déjà archivé n’offre aucune action de modification', async () => {
    await ouvrirLaFicheModifiable({
      ...heleneDeTest(),
      archive: true,
      archiveLe: '2026-11-24T05:00:00.000Z',
    });

    // Le filtre et la pagination de l'historique restent : seules les écritures disparaissent.
    expect(
      screen
        .queryAllByRole('button')
        .map((element) => element.textContent)
        .filter((nom) => /Modifier|Ajouter|Corriger|Archiver/.test(nom ?? '')),
    ).toEqual([]);
    expect(within(section('Adresses')).getAllByRole('listitem')).toHaveLength(2);
  });
});
