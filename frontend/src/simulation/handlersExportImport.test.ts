import { beforeEach, describe, expect, it } from 'vitest';
import type { Client, ListePaginee, RapportImport, ReponseAnalyse } from '../api/types';
import { appeler, statutEtCorps } from '../test/appelerLaSimulation';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { CLIENT_HELENE_PAYET, CLIENT_MARIE_THERESE_DIJOUX } from './clientsDemonstration';
import { creerJeuDeDemonstration, type JeuDeDemonstration } from './donneesDemonstration';
import { fabriquerClient } from './fabriques';
import { creerHandlersDeSimulation } from './handlersDeSimulation';

/** Lundi 23 novembre 2026 ; « maintenant » est le mercredi 25 à 10 h, heure de La Réunion. */
const LUNDI = '2026-11-23';
const MAINTENANT = new Date('2026-11-25T06:00:00.000Z');

const EN_TETE_EXPORT =
  'id;type_client;nom;prenom;raison_sociale;telephone;email;rue;complement;code_postal;ville;infos_acces;archive;cree_le';
const MESSAGE_TELEPHONE =
  'telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)';
/** Plus grands identifiants du jeu : client 13, adresse 130 (clientsDemonstration.ts). */
const PREMIER_NOUVEAU_CLIENT = 14;
const PREMIERE_NOUVELLE_ADRESSE = 131;

let jeu: JeuDeDemonstration;
let maintenant: Date;

beforeEach(() => {
  maintenant = MAINTENANT;
  jeu = creerJeuDeDemonstration(LUNDI);
  // La session simulée survit à un rechargement via sessionStorage : chaque test repart de zéro.
  sessionStorage.clear();
  serveurApi.use(
    ...creerHandlersDeSimulation(jeu, {
      urlApi,
      aujourdhui: () => LUNDI,
      maintenant: () => maintenant,
    }),
  );
});

function clientDuJeu(id: number): Client {
  return jeu.clients.find((client) => client.id === id) as Client;
}

/** Les 13 lignes d'export du jeu, plus `nombre` clients à une adresse chacun. */
function ajouterClientsAUneAdresse(nombre: number): void {
  for (let id = 1000; id < 1000 + nombre; id += 1) {
    jeu.clients.push(fabriquerClient({ id, nomAffiche: `Client ${id}` }));
  }
}

/** Corps de l'export : ses octets (BOM compris) et son texte décodé, BOM retiré. */
async function exporter(parametres = ''): Promise<{ reponse: Response; octets: Uint8Array }> {
  const reponse = await appeler('GET', `/clients/export${parametres}`);
  expect(reponse.status).toBe(200);
  return { reponse, octets: new Uint8Array(await reponse.arrayBuffer()) };
}

/** Lignes du fichier : le décodeur retire le BOM, la dernière fin de ligne ne laisse rien. */
function lignesDu(octets: Uint8Array): string[] {
  return new TextDecoder().decode(octets).split('\r\n').slice(0, -1);
}

async function analyser(corps: unknown): Promise<ReponseAnalyse> {
  const reponse = await appeler('POST', '/clients/import/analysis', corps);
  expect(reponse.status).toBe(200);
  return (await reponse.json()) as ReponseAnalyse;
}

async function importer(corps: unknown): Promise<RapportImport> {
  const reponse = await appeler('POST', '/clients/import', corps);
  expect(reponse.status).toBe(200);
  return (await reponse.json()) as RapportImport;
}

async function chercherClients(recherche: string): Promise<ListePaginee<Client>> {
  const reponse = await appeler('GET', `/clients?recherche=${encodeURIComponent(recherche)}`);
  return (await reponse.json()) as ListePaginee<Client>;
}

async function lireClient(id: number): Promise<Client> {
  return (await (await appeler('GET', `/clients/${id}`)).json()) as Client;
}

describe('GET /clients/export simulé (US32, RG26)', () => {
  it('US32 : renvoie un fichier UTF-8 avec BOM, séparé par « ; », avec l’en-tête exact et une ligne par adresse en service', async () => {
    const { octets } = await exporter('?recherche=helene');

    expect([...octets.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(lignesDu(octets)).toEqual([
      EN_TETE_EXPORT,
      '1;PARTICULIER;Payet;Hélène;;0692123456;helene.payet@exemple.re;12 rue des Lilas;Bât. B;97400;Saint-Denis;Code 4521, 3e étage;non;2026-11-20',
      '1;PARTICULIER;Payet;Hélène;;0692123456;helene.payet@exemple.re;3 chemin des Tamarins;;97430;Le Tampon;;non;2026-11-20',
    ]);
  });

  it('US32 : pose les en-têtes HTTP du back, le nom du fichier portant le jour de La Réunion', async () => {
    const { reponse } = await exporter();

    expect(reponse.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(reponse.headers.get('Content-Disposition')).toBe(
      'attachment; filename="clients-2026-11-25.csv"',
    );
    expect(reponse.headers.get('Cache-Control')).toBe('no-store');
  });

  it('US32 : à 21 h UTC, le fichier porte déjà la date du lendemain, celle de La Réunion', async () => {
    maintenant = new Date('2026-11-25T21:00:00.000Z');

    const { reponse } = await exporter();

    expect(reponse.headers.get('Content-Disposition')).toBe(
      'attachment; filename="clients-2026-11-26.csv"',
    );
  });

  it('US32 : exporte toute la liste sans archivés, dans l’ordre de la liste, une ligne par adresse en service', async () => {
    const { octets } = await exporter();

    const identifiants = lignesDu(octets)
      .slice(1)
      .map((ligne) => ligne.split(';')[0]);
    // Hélène Payet (1) sort deux fois ; l'adresse archivée de Jean-Bernard Técher (11) ne sort pas.
    expect(identifiants).toEqual([
      '2',
      '12',
      '8',
      '10',
      '1',
      '1',
      '11',
      '4',
      '7',
      '3',
      '6',
      '5',
      '9',
    ]);
  });

  it('US32 : applique le type et le tri de la liste', async () => {
    const { octets } = await exporter('?typeClient=PROFESSIONNEL&tri=-nomAffiche');

    expect(lignesDu(octets).map((ligne) => ligne.split(';')[0])).toEqual(['id', '6', '10', '2']);
  });

  it('US32 : avec archives=true, un client archivé sans adresse en service sort sur une ligne aux colonnes d’adresse vides', async () => {
    clientDuJeu(CLIENT_MARIE_THERESE_DIJOUX).adresses[0].archive = true;

    const { octets } = await exporter('?archives=true&recherche=dijoux');

    expect(lignesDu(octets)).toEqual([
      EN_TETE_EXPORT,
      '13;PARTICULIER;Dijoux;Marie-Thérèse;;0692606162;;;;;;;oui;2026-11-20',
    ]);
  });

  it('RG26 : entoure de guillemets une cellule qui contient « ; » ou « " », en doublant ceux-ci, et neutralise une formule', async () => {
    const [adresse] = clientDuJeu(CLIENT_HELENE_PAYET).adresses;
    adresse.complement = 'Bât. "B"; 2e étage';
    adresse.infosAcces = '=SOMME(A1)';

    const { octets } = await exporter('?recherche=helene');

    expect(lignesDu(octets)[1]).toBe(
      `1;PARTICULIER;Payet;Hélène;;0692123456;helene.payet@exemple.re;12 rue des Lilas;"Bât. ""B""; 2e étage";97400;Saint-Denis;'=SOMME(A1);non;2026-11-20`,
    );
  });

  it.each([
    ['page', '?page=1', ['Le champ page n’est pas autorisé']],
    ['limit', '?limit=50', ['Le champ limit n’est pas autorisé']],
    [
      'page et limit',
      '?page=1&limit=50',
      ['Le champ page n’est pas autorisé', 'Le champ limit n’est pas autorisé'],
    ],
    [
      'une recherche d’un caractère',
      '?recherche=h',
      ['recherche doit contenir au moins 2 caractères'],
    ],
  ])('US32 : répond 400 avec le message exact du back à %s', async (_cas, parametres, message) => {
    const reponse = await appeler('GET', `/clients/export${parametres}`);

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 400,
      corps: { statusCode: 400, message },
    });
  });

  it('RG26 : exporte exactement 5 000 lignes, la limite comprise', async () => {
    ajouterClientsAUneAdresse(5000 - 13);

    const { octets } = await exporter();

    // L'en-tête, puis les 5 000 lignes de données.
    expect(lignesDu(octets)).toHaveLength(5001);
  });

  it('RG26 : refuse en 400 un export de plus de 5 000 lignes', async () => {
    ajouterClientsAUneAdresse(5001 - 13);

    const reponse = await appeler('GET', '/clients/export');

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 400,
      corps: { statusCode: 400, message: 'L’export dépasse 5 000 lignes : affinez les filtres.' },
    });
  });
});

/** Quatre lignes de données ; la ligne vide (4) est sautée sans décaler les numéros suivants. */
const FICHIER_A_ANALYSER = [
  'nom;prenom;Tél.;Courriel;adresse;CP;ville;remarque',
  'Grondin;Lucette;0692 55 66 77;;5 rue des Goyaviers;97410;Saint-Pierre;',
  'Payet;Hélène;0692 12 34 56;;12 rue des Lilas;97400;Saint-Denis;cliente fidèle',
  '',
  'Hoarau;Alix;06921;;3 rue du Port;97420;Le Port;',
  'Técher;Ginette;0693 11 22 33;ginette@exemple.re;8 rue Leconte de Lisle;97400;Saint-Denis;',
].join('\r\n');

const FICHIER_SIMPLE =
  'nom;telephone;rue;cp;ville\r\nGrondin;0692 55 66 77;5 rue des Goyaviers;97410;Saint-Pierre';

describe('POST /clients/import/analysis simulé (US31)', () => {
  it('US31 : analyse 4 lignes dont 1 doublon et 1 invalide : correspondance proposée, aperçu, numéros de ligne du fichier et totaux, sans rien enregistrer', async () => {
    const analyse = await analyser({ contenu: FICHIER_A_ANALYSER });

    expect(analyse).toEqual({
      separateur: ';',
      enTetes: ['nom', 'prenom', 'Tél.', 'Courriel', 'adresse', 'CP', 'ville', 'remarque'],
      correspondance: {
        nom: 'nomClient',
        prenom: 'prenomClient',
        'Tél.': 'telephone',
        Courriel: 'emailClient',
        adresse: 'rue',
        CP: 'codePostal',
        ville: 'ville',
        remarque: null,
      },
      colonnesIgnorees: ['remarque'],
      apercu: [
        {
          numero: 2,
          cellules: [
            'Grondin',
            'Lucette',
            '0692 55 66 77',
            '',
            '5 rue des Goyaviers',
            '97410',
            'Saint-Pierre',
            '',
          ],
        },
        {
          numero: 3,
          cellules: [
            'Payet',
            'Hélène',
            '0692 12 34 56',
            '',
            '12 rue des Lilas',
            '97400',
            'Saint-Denis',
            'cliente fidèle',
          ],
        },
        {
          numero: 5,
          cellules: ['Hoarau', 'Alix', '06921', '', '3 rue du Port', '97420', 'Le Port', ''],
        },
        {
          numero: 6,
          cellules: [
            'Técher',
            'Ginette',
            '0693 11 22 33',
            'ginette@exemple.re',
            '8 rue Leconte de Lisle',
            '97400',
            'Saint-Denis',
            '',
          ],
        },
      ],
      lignes: [
        { numero: 2, resultat: 'VALIDE' },
        {
          numero: 3,
          resultat: 'DOUBLON',
          clientId: CLIENT_HELENE_PAYET,
          motif: 'Même téléphone que le client 1',
        },
        { numero: 5, resultat: 'INVALIDE', erreurs: [MESSAGE_TELEPHONE] },
        { numero: 6, resultat: 'VALIDE' },
      ],
      totaux: { lignes: 4, valides: 2, doublons: 1, invalides: 1 },
    });
    expect((await chercherClients('lucette')).meta.total).toBe(0);
    expect(jeu.clients).toHaveLength(13);
  });

  it('US31 : détecte « , », retire le BOM et lit les champs entre guillemets', async () => {
    const contenu =
      '\uFEFFnom,telephone,rue,code_postal,ville\r\n"Hoarau, fils",0692 98 76 54,"12 rue ""Les Lilas""",97400,Saint-Denis';

    const analyse = await analyser({ contenu });

    expect(analyse.separateur).toBe(',');
    expect(analyse.enTetes).toEqual(['nom', 'telephone', 'rue', 'code_postal', 'ville']);
    expect(analyse.apercu).toEqual([
      {
        numero: 2,
        cellules: ['Hoarau, fils', '0692 98 76 54', '12 rue "Les Lilas"', '97400', 'Saint-Denis'],
      },
    ]);
    expect(analyse.lignes).toEqual([{ numero: 2, resultat: 'VALIDE' }]);
  });

  it('US31 : applique la correspondance envoyée : null ignore une colonne, un choix l’emporte sur la proposition', async () => {
    // « Portable » porterait le téléphone d'Hélène Payet et « email » son e-mail : ignorés, la
    // ligne n'est pas un doublon.
    const contenu = [
      'nom;Portable;Fixe;adresse;cp;ville;email',
      'Payet;0692123456;0262 99 88 77;9 rue du Moulin;97400;Saint-Denis;helene.payet@exemple.re',
    ].join('\r\n');

    const analyse = await analyser({
      contenu,
      correspondance: { Fixe: 'telephone', email: null },
    });

    expect(analyse.correspondance).toEqual({
      nom: 'nomClient',
      Portable: null,
      Fixe: 'telephone',
      adresse: 'rue',
      cp: 'codePostal',
      ville: 'ville',
      email: null,
    });
    expect(analyse.colonnesIgnorees).toEqual(['Portable', 'email']);
    expect(analyse.lignes).toEqual([{ numero: 2, resultat: 'VALIDE' }]);
  });

  it('US31 : applique le séparateur envoyé, même s’il n’est pas celui du fichier : une seule colonne, aucun champ obligatoire', async () => {
    const reponse = await appeler('POST', '/clients/import/analysis', {
      contenu: FICHIER_SIMPLE,
      separateur: ',',
    });

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 400,
      corps: {
        statusCode: 400,
        message: [
          'Aucune colonne pour le champ obligatoire telephone',
          'Aucune colonne pour le champ obligatoire rue',
          'Aucune colonne pour le champ obligatoire codePostal',
          'Aucune colonne pour le champ obligatoire ville',
          'Aucune colonne pour nomClient ni pour raisonSociale : l’un des deux est obligatoire',
        ],
      },
    });
  });

  it.each([
    ['un fichier vide', { contenu: '' }, ['Le fichier est vide']],
    [
      'un champ obligatoire sans colonne',
      { contenu: 'Nom;Numéro;Adresse;CP;Ville\r\nPayet;0692123456;1 rue A;97400;Saint-Denis' },
      ['Aucune colonne pour le champ obligatoire telephone'],
    ],
    [
      'deux colonnes au même en-tête',
      { contenu: 'nom;telephone;rue;cp;ville;nom\r\nA;0692556677;1 rue A;97400;Saint-Denis;B' },
      ['Les colonnes 1 et 6 portent le même en-tête'],
    ],
    [
      'une correspondance qui cite un en-tête absent',
      { contenu: FICHIER_SIMPLE, correspondance: { Mobile: 'telephone' } },
      ['correspondance cite un en-tête absent du fichier : « Mobile »'],
    ],
    [
      'un champ choisi pour plusieurs colonnes',
      { contenu: FICHIER_SIMPLE, correspondance: { nom: 'telephone', telephone: 'telephone' } },
      ['Le champ telephone est choisi pour plusieurs colonnes'],
    ],
    [
      'un contenu de plus de 1 000 000 caractères',
      { contenu: 'a'.repeat(1_000_001) },
      ['contenu ne doit pas dépasser 1 000 000 caractères'],
    ],
    [
      'un fichier qui n’était pas en UTF-8 (caractère de remplacement)',
      { contenu: 'nom;ville\r\nH\uFFFDl\uFFFDne;Saint-Denis' },
      ['Enregistrez le fichier au format CSV UTF-8'],
    ],
    [
      'un fichier de plus de 1 000 lignes de données',
      {
        contenu: [
          'nom;telephone;rue;cp;ville',
          ...Array.from({ length: 1001 }, () => 'A;0692556677;1 rue A;97400;Saint-Denis'),
        ].join('\r\n'),
      },
      ['Le fichier dépasse 1 000 lignes de données'],
    ],
    [
      'un fichier sans ligne de données',
      { contenu: 'nom;telephone;rue;cp;ville\r\n' },
      ['Le fichier ne contient aucune ligne de données'],
    ],
    [
      'des guillemets non fermés',
      { contenu: 'nom;telephone;rue;cp;ville\r\n"Payet;0692123456;1 rue A;97400;Saint-Denis' },
      ['Le fichier contient des guillemets non fermés (ligne 2)'],
    ],
    [
      'une stratégie, que seule la route d’import accepte',
      { contenu: FICHIER_SIMPLE, strategieDoublons: 'IGNORER' },
      ['Le champ strategieDoublons n’est pas autorisé'],
    ],
    ['un corps sans contenu', {}, ['contenu est obligatoire']],
    ['un contenu qui n’est pas un texte', { contenu: 42 }, ['contenu doit être un texte']],
    [
      'un contenu qui contient le caractère NUL',
      { contenu: 'nom;ville\r\nPayet\u0000;Saint-Denis' },
      ['contenu contient un caractère non autorisé'],
    ],
    [
      'un séparateur autre que « ; » ou « , »',
      { contenu: FICHIER_SIMPLE, separateur: '|' },
      ['separateur doit valoir ; ou ,'],
    ],
    [
      'une correspondance qui n’est pas un objet',
      { contenu: FICHIER_SIMPLE, correspondance: [] },
      ['correspondance doit être un objet'],
    ],
    [
      'une correspondance qui associe un en-tête à autre chose qu’un texte ou null',
      { contenu: FICHIER_SIMPLE, correspondance: { nom: 42 } },
      ['correspondance doit associer chaque en-tête à un champ client ou à null'],
    ],
    [
      'une correspondance vers un champ inconnu',
      { contenu: FICHIER_SIMPLE, correspondance: { nom: 'inconnu' } },
      [
        'correspondance « nom » doit valoir typeClient, nomClient, prenomClient, raisonSociale, telephone, emailClient, rue, complement, codePostal, ville, infosAcces ou null',
      ],
    ],
  ])('US31 : répond 400 avec le message exact du back à %s', async (_cas, corps, message) => {
    const reponse = await appeler('POST', '/clients/import/analysis', corps);

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 400,
      corps: { statusCode: 400, message },
    });
  });

  it('US31 : analyse un contenu d’exactement 1 000 000 caractères, la limite comprise', async () => {
    const debut =
      'nom;telephone;rue;cp;ville;remarque\r\nGrondin;0692556677;1 rue A;97400;Saint-Denis;';
    const contenu = debut + 'x'.repeat(1_000_000 - debut.length);

    const analyse = await analyser({ contenu });

    expect(contenu).toHaveLength(1_000_000);
    expect(analyse.totaux).toEqual({ lignes: 1, valides: 1, doublons: 0, invalides: 0 });
  });

  it('US31 : analyse exactement 1 000 lignes de données, la limite comprise', async () => {
    // Téléphones 0692000000 à 0692000999 : aucun n'est celui d'un client du jeu.
    const lignes = Array.from(
      { length: 1000 },
      (_vide, rang) => `Client;0692${String(rang).padStart(6, '0')};1 rue A;97400;Saint-Denis`,
    );

    const analyse = await analyser({
      contenu: ['nom;telephone;rue;cp;ville', ...lignes].join('\n'),
    });

    expect(analyse.totaux).toEqual({ lignes: 1000, valides: 1000, doublons: 0, invalides: 0 });
    expect(analyse.lignes.at(-1)).toEqual({ numero: 1001, resultat: 'VALIDE' });
  });

  it('US31 : rejette une ligne qui n’a pas autant de cellules que la ligne d’en-têtes', async () => {
    const contenu = `${FICHIER_SIMPLE};cellule de trop`;

    const analyse = await analyser({ contenu });

    expect(analyse.lignes).toEqual([
      { numero: 2, resultat: 'INVALIDE', erreurs: ['La ligne a 6 colonnes au lieu de 5'] },
    ]);
  });

  it('US32 : un export réimporté sans modification ne donne que des doublons, BOM compris', async () => {
    const { octets } = await exporter();
    const contenu = new TextDecoder('utf-8', { ignoreBOM: true }).decode(octets);

    const analyse = await analyser({ contenu });

    expect(analyse.colonnesIgnorees).toEqual(['id', 'archive', 'cree_le']);
    expect(analyse.totaux).toEqual({ lignes: 13, valides: 0, doublons: 13, invalides: 0 });
    expect(analyse.lignes.slice(4, 6)).toEqual([
      {
        numero: 6,
        resultat: 'DOUBLON',
        clientId: CLIENT_HELENE_PAYET,
        motif: 'Même téléphone et même e-mail que le client 1',
      },
      {
        numero: 7,
        resultat: 'DOUBLON',
        clientId: CLIENT_HELENE_PAYET,
        motif: 'Même téléphone et même e-mail que le client 1',
      },
    ]);
  });
});

/** Deux lignes pour un même nouveau client : le téléphone est le même une fois normalisé. */
const FICHIER_NOUVEAU_CLIENT_EN_DOUBLE = [
  'nom;telephone;rue;cp;ville',
  'Grondin;0692 55 66 77;5 rue des Goyaviers;97410;Saint-Pierre',
  'Grondin;0692.55.66.77;7 rue des Goyaviers;97410;Saint-Pierre',
].join('\r\n');

describe('POST /clients/import/analysis simulé : doublons à l’intérieur du fichier (RG28)', () => {
  it('RG28 : rejette la seconde ligne d’un nouveau client, « Doublon de la ligne N »', async () => {
    const analyse = await analyser({ contenu: FICHIER_NOUVEAU_CLIENT_EN_DOUBLE });

    expect(analyse.lignes).toEqual([
      { numero: 2, resultat: 'VALIDE' },
      { numero: 3, resultat: 'INVALIDE', erreurs: ['Doublon de la ligne 2'] },
    ]);
    expect(analyse.totaux).toEqual({ lignes: 2, valides: 1, doublons: 0, invalides: 1 });
  });

  it('RG28 : une ligne qui reprend l’e-mail nouveau apporté par un doublon d’Hélène Payet est un doublon du même client', async () => {
    // Ligne 2 : doublon d'Hélène par son téléphone, avec un e-mail que le jeu ne connaît pas.
    // Ligne 3 : un autre téléphone, mais l'e-mail de la ligne 2.
    const contenu = [
      'nom;telephone;email;rue;cp;ville',
      'Payet;0692 12 34 56;h.payet@exemple.re;12 rue des Lilas;97400;Saint-Denis',
      'Payet;0262 11 22 33;H.Payet@exemple.re;12 rue des Lilas;97400;Saint-Denis',
    ].join('\r\n');

    const analyse = await analyser({ contenu });

    expect(analyse.lignes).toEqual([
      {
        numero: 2,
        resultat: 'DOUBLON',
        clientId: CLIENT_HELENE_PAYET,
        motif: 'Même téléphone que le client 1',
      },
      {
        numero: 3,
        resultat: 'DOUBLON',
        clientId: CLIENT_HELENE_PAYET,
        motif: 'Même e-mail que la ligne 2, doublon du client 1',
      },
    ]);
  });

  it('RG28 : rejette une ligne dont le téléphone désigne un client et l’e-mail un autre', async () => {
    // Téléphone d'Hélène Payet (1), e-mail de Jean-Yves Fontaine (4).
    const contenu = [
      'nom;telephone;email;rue;cp;ville',
      'Payet;0692 12 34 56;jy.fontaine@exemple.re;12 rue des Lilas;97400;Saint-Denis',
    ].join('\r\n');

    const analyse = await analyser({ contenu });

    expect(analyse.lignes).toEqual([
      { numero: 2, resultat: 'INVALIDE', erreurs: ['Correspond à deux clients différents'] },
    ]);
  });
});

const FICHIER_A_IMPORTER = [
  'nom;prenom;telephone;email;rue;code_postal;ville',
  'Grondin;Lucette;0692 55 66 77;;5 rue des Goyaviers;97410;Saint-Pierre',
  'Payet;Hélène-Marie;0692 12 34 56;;8 rue de Paris;97400;Saint-Denis',
  'Hoarau;Alix;06921;;3 rue du Port;97420;Le Port',
].join('\r\n');

describe('POST /clients/import simulé (US31, RG28)', () => {
  it('US31 : en METTRE_A_JOUR, crée la ligne valide, met à jour le doublon et lui ajoute son adresse, rejette l’invalide ; tout se voit ensuite dans GET /clients', async () => {
    const rapport = await importer({
      contenu: FICHIER_A_IMPORTER,
      strategieDoublons: 'METTRE_A_JOUR',
    });

    expect(rapport).toEqual({
      totaux: { crees: 1, misAJour: 1, ignores: 0, rejetes: 1 },
      lignes: [
        { numero: 2, resultat: 'CREE', clientId: PREMIER_NOUVEAU_CLIENT },
        { numero: 3, resultat: 'MIS_A_JOUR', clientId: CLIENT_HELENE_PAYET },
        { numero: 4, resultat: 'REJETE', erreurs: [MESSAGE_TELEPHONE] },
      ],
    });
    const creees = await chercherClients('lucette');
    expect(creees.data).toEqual([
      fabriquerClient({
        id: PREMIER_NOUVEAU_CLIENT,
        nomClient: 'Grondin',
        prenomClient: 'Lucette',
        nomAffiche: 'Lucette Grondin',
        telephone: '0692556677',
        creeLe: MAINTENANT.toISOString(),
        majLe: MAINTENANT.toISOString(),
        adresses: [
          {
            id: PREMIERE_NOUVELLE_ADRESSE,
            rue: '5 rue des Goyaviers',
            complement: null,
            codePostal: '97410',
            ville: 'Saint-Pierre',
            infosAcces: null,
            archive: false,
            archiveLe: null,
          },
        ],
      }),
    ]);
    const helene = await lireClient(CLIENT_HELENE_PAYET);
    expect(helene).toMatchObject({
      prenomClient: 'Hélène-Marie',
      nomAffiche: 'Hélène-Marie Payet',
      // Une cellule vide n'efface rien (RG28).
      emailClient: 'helene.payet@exemple.re',
      majLe: MAINTENANT.toISOString(),
    });
    expect(helene.adresses.map(({ id, rue }) => [id, rue])).toEqual([
      [10, '12 rue des Lilas'],
      [11, '3 chemin des Tamarins'],
      [PREMIERE_NOUVELLE_ADRESSE + 1, '8 rue de Paris'],
    ]);
    expect((await chercherClients('helene-marie')).meta.total).toBe(1);
  });

  it('US31 : en IGNORER, le doublon est ignoré avec son motif et le client existant reste intact', async () => {
    const avant = structuredClone(clientDuJeu(CLIENT_HELENE_PAYET));

    const rapport = await importer({ contenu: FICHIER_A_IMPORTER, strategieDoublons: 'IGNORER' });

    expect(rapport.totaux).toEqual({ crees: 1, misAJour: 0, ignores: 1, rejetes: 1 });
    expect(rapport.lignes[1]).toEqual({
      numero: 3,
      resultat: 'IGNORE',
      clientId: CLIENT_HELENE_PAYET,
      motif: 'Même téléphone que le client 1',
    });
    expect(await lireClient(CLIENT_HELENE_PAYET)).toEqual(avant);
  });

  it('RG28 : le doublon d’un client archivé est ignoré même en METTRE_A_JOUR, sans le toucher', async () => {
    const avant = structuredClone(clientDuJeu(CLIENT_MARIE_THERESE_DIJOUX));
    const contenu =
      'nom;prenom;telephone;rue;cp;ville\r\nDijoux;Thérèse;0692 60 61 62;1 rue Neuve;97419;La Possession';

    const rapport = await importer({ contenu, strategieDoublons: 'METTRE_A_JOUR' });

    expect(rapport).toEqual({
      totaux: { crees: 0, misAJour: 0, ignores: 1, rejetes: 0 },
      lignes: [
        {
          numero: 2,
          resultat: 'IGNORE',
          clientId: CLIENT_MARIE_THERESE_DIJOUX,
          motif: 'Client archivé : il ne sera pas mis à jour',
        },
      ],
    });
    expect(clientDuJeu(CLIENT_MARIE_THERESE_DIJOUX)).toEqual(avant);
  });

  it('RG28 : un fichier qui répète un nouveau client n’en crée qu’un, la seconde ligne étant rejetée', async () => {
    const rapport = await importer({
      contenu: FICHIER_NOUVEAU_CLIENT_EN_DOUBLE,
      strategieDoublons: 'METTRE_A_JOUR',
    });

    expect(rapport).toEqual({
      totaux: { crees: 1, misAJour: 0, ignores: 0, rejetes: 1 },
      lignes: [
        { numero: 2, resultat: 'CREE', clientId: PREMIER_NOUVEAU_CLIENT },
        { numero: 3, resultat: 'REJETE', erreurs: ['Doublon de la ligne 2'] },
      ],
    });
    const parTelephone = await chercherClients('0692556677');
    expect(
      parTelephone.data.map(({ id, adresses }) => [id, adresses.map(({ rue }) => rue)]),
    ).toEqual([[PREMIER_NOUVEAU_CLIENT, ['5 rue des Goyaviers']]]);
    expect(jeu.clients).toHaveLength(14);
  });

  it('US31 : un client créé ensuite depuis l’écran reçoit l’identifiant suivant ceux de l’import, sans collision', async () => {
    await importer({ contenu: FICHIER_SIMPLE, strategieDoublons: 'IGNORER' });

    const reponse = await appeler('POST', '/clients', {
      typeClient: 'PARTICULIER',
      nomClient: 'Boyer',
      telephone: '0693445566',
      adresse: { rue: '2 rue des Cocotiers', codePostal: '97400', ville: 'Saint-Denis' },
    });

    expect(reponse.status).toBe(201);
    const cree = (await reponse.json()) as Client;
    expect(cree.id).toBe(PREMIER_NOUVEAU_CLIENT + 1);
    expect(cree.adresses[0].id).toBe(PREMIERE_NOUVELLE_ADRESSE + 1);
  });

  it.each([
    [
      'sans stratégie pour les doublons',
      { contenu: FICHIER_SIMPLE },
      ['strategieDoublons doit valoir IGNORER ou METTRE_A_JOUR'],
    ],
    [
      'à un champ obligatoire sans colonne',
      {
        contenu: 'Nom;Numéro;Adresse;CP;Ville\r\nPayet;0692123456;1 rue A;97400;Saint-Denis',
        strategieDoublons: 'IGNORER',
      },
      ['Aucune colonne pour le champ obligatoire telephone'],
    ],
  ])('US31 : répond 400 %s, sans rien créer', async (_cas, corps, message) => {
    const reponse = await appeler('POST', '/clients/import', corps);

    expect(await statutEtCorps(reponse)).toEqual({
      statut: 400,
      corps: { statusCode: 400, message },
    });
    expect(jeu.clients).toHaveLength(13);
  });
});
