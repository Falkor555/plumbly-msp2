import { HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enregistrerLesRequetes, parametresRecus } from '../test/msw/requetesRecues';
import { clientsApi } from './clients.api';
import { ErreurApi } from './erreurs';
import type {
  Adresse,
  Client,
  DemandeImport,
  ListePaginee,
  NouveauClient,
  RapportImport,
  ReponseAnalyse,
} from './types';

function adresse(id = 3): Adresse {
  return {
    id,
    rue: '12 rue des Flamboyants',
    complement: null,
    codePostal: '97400',
    ville: 'Saint-Denis',
    infosAcces: null,
    archive: false,
    archiveLe: null,
  };
}

function client(id = 7): Client {
  return {
    id,
    typeClient: 'PARTICULIER',
    nomClient: 'Payet',
    prenomClient: 'Hélène',
    raisonSociale: null,
    nomAffiche: 'Hélène Payet',
    telephone: '0692123456',
    emailClient: null,
    archive: false,
    archiveLe: null,
    creeLe: '2026-11-20T06:00:00.000Z',
    majLe: '2026-11-20T06:00:00.000Z',
    adresses: [adresse()],
  };
}

function pageDe<T>(data: T[]): ListePaginee<T> {
  return { data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } };
}

const CSV_EXPORTE = '\uFEFFid;type_client;nom\r\n7;PARTICULIER;Payet\r\n';

function reponseCsv(enTetes: Record<string, string> = {}): () => Response {
  return () =>
    HttpResponse.text(CSV_EXPORTE, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', ...enTetes },
    });
}

describe('liste des clients', () => {
  it('US08 : envoie la recherche réduite, le type, le tri et la page, sans archives par défaut', async () => {
    const recues = enregistrerLesRequetes('get', '/clients', () =>
      HttpResponse.json(pageDe([client()])),
    );

    const page = await clientsApi.lister({
      recherche: '  Hélène ',
      typeClient: 'PARTICULIER',
      archives: false,
      tri: '-creeLe',
      page: 2,
      limit: 20,
    });

    expect(parametresRecus(recues[0])).toEqual({
      recherche: 'Hélène',
      typeClient: 'PARTICULIER',
      tri: '-creeLe',
      page: '2',
      limit: '20',
    });
    expect(page.data[0]?.nomAffiche).toBe('Hélène Payet');
  });

  it('US08 : n’envoie pas une recherche de moins de 2 caractères une fois réduite', async () => {
    const recues = enregistrerLesRequetes('get', '/clients', () => HttpResponse.json(pageDe([])));

    await clientsApi.lister({ recherche: ' a ' });
    await clientsApi.lister({ recherche: '' });

    expect(parametresRecus(recues[0])).toEqual({});
    expect(parametresRecus(recues[1])).toEqual({});
  });

  it('US08 : envoie une recherche d’exactement 2 caractères une fois réduite', async () => {
    const recues = enregistrerLesRequetes('get', '/clients', () => HttpResponse.json(pageDe([])));

    await clientsApi.lister({ recherche: ' ab ' });

    expect(parametresRecus(recues[0])).toEqual({ recherche: 'ab' });
  });

  it('US08 : envoie archives=true seulement quand les archivés sont demandés', async () => {
    const recues = enregistrerLesRequetes('get', '/clients', () => HttpResponse.json(pageDe([])));

    await clientsApi.lister({ archives: true });

    expect(parametresRecus(recues[0])).toEqual({ archives: 'true' });
  });

  it('US08 : plafonne limit à 100, le maximum accepté par l’API', async () => {
    const recues = enregistrerLesRequetes('get', '/clients', () => HttpResponse.json(pageDe([])));

    await clientsApi.lister({ page: 1, limit: 500 });

    expect(parametresRecus(recues[0])).toEqual({ page: '1', limit: '100' });
  });

  it('US08 : ramène page et limit à un entier d’au moins 1, le minimum accepté par l’API', async () => {
    const recues = enregistrerLesRequetes('get', '/clients', () => HttpResponse.json(pageDe([])));

    await clientsApi.lister({ page: 0, limit: 0 });
    await clientsApi.lister({ page: -3, limit: 2.7 });
    await clientsApi.lister({ page: Number.NaN, limit: Number.POSITIVE_INFINITY });

    expect(parametresRecus(recues[0])).toEqual({ page: '1', limit: '1' });
    expect(parametresRecus(recues[1])).toEqual({ page: '1', limit: '2' });
    expect(parametresRecus(recues[2])).toEqual({});
  });

  it('US08 : encode une recherche qui contient des caractères spéciaux', async () => {
    const recues = enregistrerLesRequetes('get', '/clients', () => HttpResponse.json(pageDe([])));

    await clientsApi.lister({ recherche: "' OR 1=1 --" });

    expect(recues[0]?.url.search).toBe('?recherche=%27+OR+1%3D1+--');
  });
});

describe('fiche et modification d’un client', () => {
  it('US06 : envoie le client et sa première adresse en JSON', async () => {
    const nouveau: NouveauClient = {
      typeClient: 'PARTICULIER',
      nomClient: 'Payet',
      prenomClient: 'Hélène',
      telephone: '0692 12 34 56',
      adresse: { rue: '12 rue des Flamboyants', codePostal: '97400', ville: 'Saint-Denis' },
    };
    const recues = enregistrerLesRequetes('post', '/clients', () =>
      HttpResponse.json(client(), { status: 201 }),
    );

    const cree = await clientsApi.creer(nouveau);

    expect(recues[0]?.enTetes.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(recues[0]?.corps ?? '')).toEqual(nouveau);
    expect(cree.id).toBe(7);
  });

  it('US10 : lit un client par son identifiant', async () => {
    const recues = enregistrerLesRequetes('get', '/clients/7', () => HttpResponse.json(client()));

    const lu = await clientsApi.consulter(7);

    expect(recues).toHaveLength(1);
    expect(lu.adresses).toHaveLength(1);
  });

  it('US10 : envoie null pour effacer un champ facultatif', async () => {
    const recues = enregistrerLesRequetes('patch', '/clients/7', () => HttpResponse.json(client()));

    await clientsApi.modifier(7, { telephone: '0262 12 34 56', emailClient: null });

    expect(JSON.parse(recues[0]?.corps ?? '')).toEqual({
      telephone: '0262 12 34 56',
      emailClient: null,
    });
  });

  it('US10 : archive le client par un POST sans corps', async () => {
    const recues = enregistrerLesRequetes('post', '/clients/7/archive', () =>
      HttpResponse.json({ ...client(), archive: true }),
    );

    const archive = await clientsApi.archiver(7);

    expect(recues[0]?.corps).toBe('');
    expect(archive.archive).toBe(true);
  });

  it('RG22 : remonte tel quel le refus d’archiver un client qui a des interventions actives', async () => {
    const message =
      'Impossible d’archiver ce client tant qu’il a des interventions à planifier, planifiées ou en cours (2 actuellement) : terminez-les ou annulez-les d’abord.';
    enregistrerLesRequetes('post', '/clients/7/archive', () =>
      HttpResponse.json({ statusCode: 409, message, error: 'Conflict' }, { status: 409 }),
    );

    const erreur = await clientsApi.archiver(7).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ErreurApi);
    expect((erreur as ErreurApi).messagePourUtilisateur()).toBe(message);
  });
});

describe('historique d’un client', () => {
  it('US09 : envoie les statuts en un seul paramètre séparé par des virgules', async () => {
    const recues = enregistrerLesRequetes('get', '/clients/7/interventions', () =>
      HttpResponse.json(pageDe([])),
    );

    await clientsApi.historique(7, { page: 3, limit: 10, statuts: ['PLANIFIEE', 'EN_COURS'] });

    expect(recues[0]?.url.search).toBe('?page=3&limit=10&statut=PLANIFIEE%2CEN_COURS');
    expect(recues[0]?.url.searchParams.getAll('statut')).toEqual(['PLANIFIEE,EN_COURS']);
  });

  it('US09 : n’envoie pas de statut quand aucun n’est coché, ni de tri que l’API refuserait', async () => {
    const recues = enregistrerLesRequetes('get', '/clients/7/interventions', () =>
      HttpResponse.json(pageDe([])),
    );

    await clientsApi.historique(7, { page: 1, statuts: [] });
    await clientsApi.historique(7, { limit: 250 });

    expect(parametresRecus(recues[0])).toEqual({ page: '1' });
    expect(parametresRecus(recues[1])).toEqual({ limit: '100' });
  });
});

describe('adresses d’un client', () => {
  it('US07 : ajoute une adresse au client', async () => {
    const recues = enregistrerLesRequetes('post', '/clients/7/addresses', () =>
      HttpResponse.json(adresse(4), { status: 201 }),
    );

    const ajoutee = await clientsApi.ajouterAdresse(7, {
      rue: '3 chemin Bois de Nèfles',
      complement: 'Bâtiment B',
      codePostal: '97490',
      ville: 'Sainte-Clotilde',
    });

    expect(JSON.parse(recues[0]?.corps ?? '')).toEqual({
      rue: '3 chemin Bois de Nèfles',
      complement: 'Bâtiment B',
      codePostal: '97490',
      ville: 'Sainte-Clotilde',
    });
    expect(ajoutee.id).toBe(4);
  });

  it('US07 : modifie une adresse et efface son complément avec null', async () => {
    const recues = enregistrerLesRequetes('patch', '/clients/7/addresses/3', () =>
      HttpResponse.json(adresse()),
    );

    await clientsApi.modifierAdresse(7, 3, { ville: 'Le Port', complement: null });

    expect(JSON.parse(recues[0]?.corps ?? '')).toEqual({ ville: 'Le Port', complement: null });
  });

  it('US07 : archive une adresse du client par un POST sans corps', async () => {
    const recues = enregistrerLesRequetes('post', '/clients/7/addresses/3/archive', () =>
      HttpResponse.json({ ...adresse(), archive: true, archiveLe: '2026-11-25T06:00:00.000Z' }),
    );

    const archivee = await clientsApi.archiverAdresse(7, 3);

    expect(recues[0]?.corps).toBe('');
    expect(archivee.archive).toBe(true);
  });
});

describe('export des clients en CSV', () => {
  beforeEach(() => {
    // jsdom ne sait pas naviguer : le clic du lien de téléchargement est neutralisé.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('US32 : envoie les filtres de la liste sans page ni limit, que l’export refuse', async () => {
    const recues = enregistrerLesRequetes(
      'get',
      '/clients/export',
      reponseCsv({ 'Content-Disposition': 'attachment; filename="clients-2026-11-25.csv"' }),
    );
    const filtresDeLaListe = {
      recherche: ' Payet ',
      typeClient: 'PARTICULIER' as const,
      archives: true,
      tri: 'nomAffiche' as const,
      page: 4,
      limit: 20,
    };

    await clientsApi.exporter(filtresDeLaListe);

    expect(parametresRecus(recues[0])).toEqual({
      recherche: 'Payet',
      typeClient: 'PARTICULIER',
      archives: 'true',
      tri: 'nomAffiche',
    });
  });

  it('US32 : propose le fichier sous le nom donné par l’API, BOM compris', async () => {
    enregistrerLesRequetes(
      'get',
      '/clients/export',
      reponseCsv({ 'Content-Disposition': 'attachment; filename="clients-2026-11-25.csv"' }),
    );
    const creerAdresse = vi.spyOn(URL, 'createObjectURL');

    const nom = await clientsApi.exporter({});

    expect(nom).toBe('clients-2026-11-25.csv');
    const contenu = creerAdresse.mock.calls[0]?.[0] as Blob;
    expect([...new Uint8Array(await contenu.arrayBuffer()).slice(0, 3)]).toEqual([
      0xef, 0xbb, 0xbf,
    ]);
  });

  it('US32 : à défaut d’en-tête, nomme le fichier du jour à La Réunion', async () => {
    // 21 h UTC le 24 novembre : il est déjà 1 h le 25 à La Réunion.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T21:00:00.000Z'));
    enregistrerLesRequetes('get', '/clients/export', reponseCsv());

    const nom = await clientsApi.exporter({});

    expect(nom).toBe('clients-2026-11-25.csv');
  });

  it('US32 : remonte le refus d’un export trop volumineux sans proposer de fichier', async () => {
    const message = 'L’export dépasse 5 000 lignes : affinez les filtres.';
    enregistrerLesRequetes('get', '/clients/export', () =>
      HttpResponse.json({ statusCode: 400, message, error: 'Bad Request' }, { status: 400 }),
    );

    const erreur = await clientsApi.exporter({}).catch((e: unknown) => e);

    expect((erreur as ErreurApi).messagePourUtilisateur()).toBe(message);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
});

describe('import des clients', () => {
  const analyse: ReponseAnalyse = {
    separateur: ';',
    enTetes: ['Nom', 'Tél.'],
    correspondance: { Nom: 'nomClient', 'Tél.': 'telephone' },
    colonnesIgnorees: [],
    apercu: [{ numero: 2, cellules: ['Payet', '0692123456'] }],
    lignes: [{ numero: 2, resultat: 'VALIDE' }],
    totaux: { lignes: 1, valides: 1, doublons: 0, invalides: 0 },
  };

  it('US31 : envoie le contenu, le séparateur et la correspondance à l’analyse', async () => {
    const recues = enregistrerLesRequetes('post', '/clients/import/analysis', () =>
      HttpResponse.json(analyse),
    );
    const demande = {
      contenu: 'Nom;Tél.\r\nPayet;0692123456\r\n',
      separateur: ';' as const,
      correspondance: { 'Tél.': 'telephone' as const },
    };

    const reponse = await clientsApi.analyserImport(demande);

    expect(JSON.parse(recues[0]?.corps ?? '')).toEqual(demande);
    expect(reponse.totaux.valides).toBe(1);
  });

  it('US31 : envoie la stratégie des doublons à l’import et renvoie le compte rendu', async () => {
    const rapport: RapportImport = {
      totaux: { crees: 1, misAJour: 0, ignores: 0, rejetes: 0 },
      lignes: [{ numero: 2, resultat: 'CREE', clientId: 12 }],
    };
    const recues = enregistrerLesRequetes('post', '/clients/import', () =>
      HttpResponse.json(rapport),
    );
    const demande: DemandeImport = {
      contenu: 'Nom;Tél.\r\nPayet;0692123456\r\n',
      strategieDoublons: 'IGNORER',
    };

    const recu = await clientsApi.importer(demande);

    expect(JSON.parse(recues[0]?.corps ?? '')).toEqual(demande);
    expect(recu).toEqual(rapport);
  });
});
