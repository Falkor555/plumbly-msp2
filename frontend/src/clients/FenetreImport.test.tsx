import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { clientsApi } from '../api/clients.api';
import type { RapportImport, ReponseAnalyse } from '../api/types';
import { clientsDeTest, servirLesClients } from '../test/clientsDeTest';
import { enregistrerLesRequetes, type RequeteRecue } from '../test/msw/requetesRecues';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageClients } from './PageClients';

/*
 * US31 : import des clients depuis la page, à travers les trois étapes de l'assistant. L'API est
 * simulée par MSW : une requête non prévue (un import avant la confirmation, une relecture de la
 * liste en trop) ferait échouer le test.
 */

type Utilisateur = ReturnType<typeof userEvent.setup>;

const CSV = [
  'nom;prenom;Tel;adresse;code_postal;ville;remarque',
  'Payet;Hélène;0692 12 34 56;12 rue des Lilas;97400;Saint-Denis;<b>x</b>',
  'Hoarau;Gérard;0693 44 55 66;5 rue de Paris;97410;Saint-Pierre;',
  'Grondin;Josiane;0692;8 rue des Goyaviers;974;Saint-André;',
].join('\n');

const ERREURS_LIGNE_4 = [
  'telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)',
  'codePostal doit contenir 5 chiffres',
];

function analyseDeTest(): ReponseAnalyse {
  return {
    separateur: ';',
    enTetes: ['nom', 'prenom', 'Tel', 'adresse', 'code_postal', 'ville', 'remarque'],
    correspondance: {
      nom: 'nomClient',
      prenom: 'prenomClient',
      Tel: 'telephone',
      adresse: 'rue',
      code_postal: 'codePostal',
      ville: 'ville',
      remarque: null,
    },
    colonnesIgnorees: ['remarque'],
    apercu: CSV.split('\n')
      .slice(1)
      .map((ligne, rang) => ({ numero: rang + 2, cellules: ligne.split(';') })),
    lignes: [
      { numero: 2, resultat: 'VALIDE' },
      { numero: 3, resultat: 'DOUBLON', clientId: 4, motif: 'Même téléphone que le client 4' },
      { numero: 4, resultat: 'INVALIDE', erreurs: ERREURS_LIGNE_4 },
    ],
    totaux: { lignes: 3, valides: 1, doublons: 1, invalides: 1 },
  };
}

function rapportDeTest(): RapportImport {
  return {
    totaux: { crees: 1, misAJour: 0, ignores: 1, rejetes: 1 },
    lignes: [
      { numero: 2, resultat: 'CREE', clientId: 31 },
      { numero: 3, resultat: 'IGNORE', clientId: 4, motif: 'Même téléphone que le client 4' },
      { numero: 4, resultat: 'REJETE', erreurs: ERREURS_LIGNE_4 },
    ],
  };
}

function fichierCsv(contenu: BlobPart = CSV, nom = 'clients.csv'): File {
  return new File([contenu], nom, { type: 'text/csv' });
}

function servirLAnalyse(): RequeteRecue[] {
  return enregistrerLesRequetes('post', '/clients/import/analysis', () =>
    HttpResponse.json(analyseDeTest()),
  );
}

function servirLImport(): RequeteRecue[] {
  return enregistrerLesRequetes('post', '/clients/import', () =>
    HttpResponse.json(rapportDeTest()),
  );
}

function corps(requete: RequeteRecue | undefined): unknown {
  return JSON.parse(requete?.corps ?? 'null');
}

interface AnalyseRetenue {
  recues: unknown[];
  liberer: () => void;
}

/**
 * Simule l'analyse en retenant la réponse de la requête de rang `rangRetenu` (à partir de 1)
 * jusqu'à liberer(), pour observer l'écran pendant une analyse ou faire arriver une réponse en
 * retard. `reponse` donne la réponse de chaque rang.
 */
function servirLAnalyseEnRetenant(
  rangRetenu: number,
  reponse: (rang: number) => ReponseAnalyse = analyseDeTest,
): AnalyseRetenue {
  const recues: unknown[] = [];
  let liberer = () => {};
  const retenue = new Promise<void>((resoudre) => {
    liberer = resoudre;
  });
  serveurApi.use(
    http.post(urlApi('/clients/import/analysis'), async ({ request }) => {
      recues.push(await request.json());
      const rang = recues.length;
      if (rang === rangRetenu) await retenue;
      return HttpResponse.json(reponse(rang));
    }),
  );
  return { recues, liberer: () => liberer() };
}

function refus(status: number, message: string | string[]) {
  return () => HttpResponse.json({ statusCode: status, message }, { status });
}

function fenetre(): HTMLElement {
  return screen.getByRole('dialog');
}

/** Libellé de chaque étape, qui nomme aussi la fenêtre. */
const ETAPE_1 = 'Étape 1 sur 3 : Choisir le fichier';
const ETAPE_2 = 'Étape 2 sur 3 : Vérifier l’analyse';
const ETAPE_3 = 'Étape 3 sur 3 : Compte rendu de l’import';

async function ouvrirLImport(utilisateur: Utilisateur): Promise<HTMLElement> {
  await screen.findByRole('link', { name: 'Hélène Payet' });
  await utilisateur.click(screen.getByRole('button', { name: 'Importer' }));
  return screen.getByRole('dialog', { name: ETAPE_1 });
}

async function choisirLeFichier(utilisateur: Utilisateur, fichier = fichierCsv()): Promise<void> {
  await utilisateur.upload(within(fenetre()).getByLabelText('Fichier CSV'), fichier);
}

/** Ouvre l'assistant, choisit le fichier et attend l'étape 2. */
async function analyserLeFichier(utilisateur: Utilisateur): Promise<HTMLElement> {
  await ouvrirLImport(utilisateur);
  await choisirLeFichier(utilisateur);
  await within(fenetre()).findByText('clients.csv');
  await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Analyser le fichier' }));
  return screen.findByRole('dialog', { name: ETAPE_2 });
}

function menuDeLaColonne(enTete: string): HTMLElement {
  return within(fenetre()).getByRole('combobox', { name: `Champ pour la colonne « ${enTete} »` });
}

function tableau(nom: string): HTMLElement {
  return within(fenetre()).getByRole('table', { name: nom });
}

/** Cellules d'une ligne d'un tableau de lignes, repérée par son numéro dans le fichier. */
function detailDeLaLigne(table: HTMLElement, numero: number): string[] {
  const ligne = within(table)
    .getByRole('rowheader', { name: String(numero) })
    .closest('tr');
  return within(ligne as HTMLElement)
    .getAllByRole('listitem')
    .map((element) => element.textContent ?? '');
}

function compteur(libelle: string): string | null | undefined {
  return within(fenetre()).getByText(libelle, { selector: 'dt' }).nextElementSibling?.textContent;
}

describe('import des clients : analyse puis confirmation (US31)', () => {
  it('US31 : affiche l’analyse avec ses lignes en erreur, n’importe rien avant la confirmation, puis donne le compte rendu et relit la liste à la fermeture', async () => {
    const utilisateur = userEvent.setup();
    const lectures = servirLesClients(clientsDeTest());
    const analyses = servirLAnalyse();
    const imports = servirLImport();
    render(<PageClients />);

    await analyserLeFichier(utilisateur);

    expect(screen.getByRole('heading', { level: 2, name: ETAPE_2 })).toHaveFocus();
    expect(corps(analyses[0])).toEqual({ contenu: CSV });
    expect(compteur('Lignes lues')).toBe('3');
    expect(compteur('Valides')).toBe('1');
    expect(compteur('Doublons')).toBe('1');
    expect(compteur('En erreur')).toBe('1');
    expect(menuDeLaColonne('Tel')).toHaveDisplayValue('Téléphone');
    expect(menuDeLaColonne('remarque')).toHaveDisplayValue('Ignorer la colonne');
    const ignorees = within(fenetre()).getByRole('heading', { name: 'Colonnes ignorées' });
    expect(ignorees.nextElementSibling).toHaveTextContent('remarque');
    const enErreur = tableau(
      'Lignes en erreur : numéro de la ligne dans le fichier et motifs du rejet',
    );
    expect(
      within(enErreur)
        .getAllByRole('rowheader')
        .map((cellule) => cellule.textContent),
    ).toEqual(['4']);
    expect(detailDeLaLigne(enErreur, 4)).toEqual(ERREURS_LIGNE_4);
    const doublons = tableau('Doublons : numéro de la ligne dans le fichier et client reconnu');
    expect(within(doublons).getByRole('rowheader', { name: '3' }).closest('tr')).toHaveTextContent(
      'Même téléphone que le client 4',
    );
    expect(within(fenetre()).getByRole('radio', { name: 'Ignorer les doublons' })).toBeChecked();
    expect(imports).toHaveLength(0);

    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Importer 1 ligne' }));

    expect(await screen.findByRole('heading', { level: 2, name: ETAPE_3 })).toHaveFocus();
    expect(imports).toHaveLength(1);
    expect(corps(imports[0])).toEqual({ contenu: CSV, strategieDoublons: 'IGNORER' });
    expect(compteur('Créés')).toBe('1');
    expect(compteur('Mis à jour')).toBe('0');
    expect(compteur('Ignorés')).toBe('1');
    expect(compteur('Rejetés')).toBe('1');
    const rejetees = tableau(
      'Lignes rejetées : numéro de la ligne dans le fichier et motifs du rejet',
    );
    expect(detailDeLaLigne(rejetees, 4)).toEqual(ERREURS_LIGNE_4);
    expect(lectures).toHaveLength(1);

    await utilisateur.click(
      within(fenetre()).getByRole('button', { name: 'Fermer et revenir à la liste' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(lectures).toHaveLength(2));
    expect(
      screen.getByText('Import terminé : la liste des clients est relue.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer' })).toHaveFocus();
    expect(analyses).toHaveLength(1);
  });

  it('RG28 : choisir de mettre à jour les doublons les compte dans le bouton et l’envoie à l’import', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    servirLAnalyse();
    const imports = servirLImport();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);
    const strategie = within(fenetre()).getByRole('group', { name: 'Que faire des doublons ?' });

    await utilisateur.click(
      within(strategie).getByRole('radio', { name: 'Mettre à jour les clients existants' }),
    );
    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Importer 2 lignes' }));

    await screen.findByRole('dialog', { name: ETAPE_3 });
    expect(corps(imports[0])).toEqual({ contenu: CSV, strategieDoublons: 'METTRE_A_JOUR' });
  });

  it('US31 : sans doublon, la stratégie n’est pas demandée et l’import envoie la valeur par défaut', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    enregistrerLesRequetes('post', '/clients/import/analysis', () =>
      HttpResponse.json({
        ...analyseDeTest(),
        lignes: [{ numero: 2, resultat: 'VALIDE' }],
        totaux: { lignes: 1, valides: 1, doublons: 0, invalides: 0 },
      }),
    );
    const imports = servirLImport();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);

    expect(within(fenetre()).queryByRole('group', { name: 'Que faire des doublons ?' })).toBeNull();
    expect(within(fenetre()).getByText('Aucune ligne en erreur.')).toBeInTheDocument();
    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Importer 1 ligne' }));

    await screen.findByRole('dialog', { name: ETAPE_3 });
    expect(corps(imports[0])).toEqual({ contenu: CSV, strategieDoublons: 'IGNORER' });
  });

  it('US31 : sans aucune ligne à enregistrer, « Importer 0 ligne » est inactif et l’explique', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    enregistrerLesRequetes('post', '/clients/import/analysis', () =>
      HttpResponse.json({
        ...analyseDeTest(),
        lignes: [{ numero: 2, resultat: 'INVALIDE', erreurs: ['ville est obligatoire'] }],
        totaux: { lignes: 1, valides: 0, doublons: 0, invalides: 1 },
      }),
    );
    const imports = servirLImport();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);
    const importer = within(fenetre()).getByRole('button', { name: 'Importer 0 ligne' });

    await utilisateur.click(importer);

    expect(importer).toHaveAttribute('aria-disabled', 'true');
    expect(importer).toHaveAccessibleDescription('Aucune ligne à enregistrer avec ces choix.');
    expect(imports).toHaveLength(0);
  });

  it('US31 : changer le champ d’une colonne relance l’analyse en n’envoyant que cette colonne, puis l’import reprend cette correspondance', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const analyses = servirLAnalyse();
    const imports = servirLImport();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);

    await utilisateur.selectOptions(menuDeLaColonne('remarque'), 'Informations d’accès');

    await waitFor(() => expect(analyses).toHaveLength(2));
    expect(corps(analyses[1])).toEqual({
      contenu: CSV,
      correspondance: { remarque: 'infosAcces' },
    });
    expect(menuDeLaColonne('remarque')).toHaveDisplayValue('Informations d’accès');
    expect(menuDeLaColonne('remarque')).toHaveFocus();

    await utilisateur.selectOptions(menuDeLaColonne('prenom'), 'Ignorer la colonne');

    await waitFor(() => expect(analyses).toHaveLength(3));
    expect(corps(analyses[2])).toEqual({
      contenu: CSV,
      correspondance: { remarque: 'infosAcces', prenom: null },
    });
    await waitFor(() =>
      expect(within(fenetre()).getByRole('status')).not.toHaveTextContent('Analyse en cours'),
    );
    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Importer 1 ligne' }));
    await screen.findByRole('dialog', { name: ETAPE_3 });
    expect(corps(imports[0])).toEqual({
      contenu: CSV,
      correspondance: { remarque: 'infosAcces', prenom: null },
      strategieDoublons: 'IGNORER',
    });
  });

  it('US31 : donner à une colonne le champ d’une autre retire ce champ à celle-ci sans envoyer deux fois le même champ', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const analyses = servirLAnalyse();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);
    expect(
      within(menuDeLaColonne('remarque')).getByRole('option', {
        name: 'Téléphone (pris par « Tel »)',
      }),
    ).toBeInTheDocument();

    await utilisateur.selectOptions(menuDeLaColonne('remarque'), 'Téléphone (pris par « Tel »)');
    await waitFor(() => expect(analyses).toHaveLength(2));
    await utilisateur.selectOptions(menuDeLaColonne('Tel'), 'Téléphone (pris par « remarque »)');

    await waitFor(() => expect(analyses).toHaveLength(3));
    expect(corps(analyses[2])).toEqual({
      contenu: CSV,
      correspondance: { remarque: null, Tel: 'telephone' },
    });
  });

  it('US31 : changer de séparateur relance l’analyse sans la correspondance choisie, devenue caduque', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const analyses = servirLAnalyse();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);
    await utilisateur.selectOptions(menuDeLaColonne('remarque'), 'Informations d’accès');
    await waitFor(() => expect(analyses).toHaveLength(2));

    await utilisateur.selectOptions(
      within(fenetre()).getByRole('combobox', { name: 'Séparateur des colonnes' }),
      'Virgule (,)',
    );

    await waitFor(() => expect(analyses).toHaveLength(3));
    expect(corps(analyses[2])).toEqual({ contenu: CSV, separateur: ',' });
    expect(menuDeLaColonne('remarque')).toHaveDisplayValue('Ignorer la colonne');
  });

  it('US31 : un refus de l’analyse après un changement de colonne reste à l’étape 2, s’affiche tel quel et bloque l’import', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    servirLAnalyse();
    const imports = servirLImport();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);
    const message = 'Aucune colonne pour le champ obligatoire telephone';
    serveurApi.use(http.post(urlApi('/clients/import/analysis'), refus(400, [message])));

    await utilisateur.selectOptions(menuDeLaColonne('Tel'), 'Ignorer la colonne');

    const alerte = await within(fenetre()).findByRole('alert');
    expect(alerte).toHaveTextContent(message);
    expect(alerte).toHaveTextContent(
      'Choisissez une colonne pour ce champ dans le tableau de correspondance.',
    );
    expect(screen.getByRole('dialog', { name: ETAPE_2 })).toBeInTheDocument();
    expect(menuDeLaColonne('Tel')).toHaveAttribute('aria-invalid', 'true');
    expect(menuDeLaColonne('Tel')).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(menuDeLaColonne('remarque')).not.toHaveAttribute('aria-invalid');
    const importer = within(fenetre()).getByRole('button', { name: 'Importer 1 ligne' });
    expect(importer).toHaveAttribute('aria-disabled', 'true');
    await utilisateur.click(importer);
    expect(imports).toHaveLength(0);
  });

  it('US31 : la réponse en retard d’une analyse dépassée n’écrase ni l’analyse affichée ni la correspondance importée', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const totauxParRang: Record<number, ReponseAnalyse['totaux']> = {
      2: { lignes: 3, valides: 0, doublons: 0, invalides: 3 },
      3: { lignes: 3, valides: 2, doublons: 1, invalides: 0 },
    };
    const analyses = servirLAnalyseEnRetenant(2, (rang) => ({
      ...analyseDeTest(),
      totaux: totauxParRang[rang] ?? analyseDeTest().totaux,
    }));
    const imports = servirLImport();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);
    const appels = vi.spyOn(clientsApi, 'analyserImport');
    await utilisateur.selectOptions(menuDeLaColonne('remarque'), 'Complément d’adresse');
    await waitFor(() => expect(analyses.recues).toHaveLength(2));
    await utilisateur.selectOptions(menuDeLaColonne('remarque'), 'Informations d’accès');
    await waitFor(() => expect(compteur('Valides')).toBe('2'));

    await act(async () => {
      analyses.liberer();
      await appels.mock.results[0]?.value;
    });

    expect(compteur('Valides')).toBe('2');
    expect(compteur('En erreur')).toBe('0');
    expect(within(fenetre()).getByRole('status')).not.toHaveTextContent('Analyse en cours');
    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Importer 2 lignes' }));
    await screen.findByRole('dialog', { name: ETAPE_3 });
    expect(corps(imports[0])).toEqual({
      contenu: CSV,
      correspondance: { remarque: 'infosAcces' },
      strategieDoublons: 'IGNORER',
    });
  });

  it('US31 : pendant l’analyse du fichier, le séparateur ne peut pas changer, pour que le menu affiche celui de l’analyse', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const analyses = servirLAnalyseEnRetenant(1);
    render(<PageClients />);
    await ouvrirLImport(utilisateur);
    await choisirLeFichier(utilisateur);
    await within(fenetre()).findByText('clients.csv');
    const separateur = within(fenetre()).getByRole('combobox', { name: 'Séparateur des colonnes' });

    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Analyser le fichier' }));

    await waitFor(() => expect(analyses.recues).toHaveLength(1));
    expect(separateur).toBeDisabled();
    analyses.liberer();
    await screen.findByRole('dialog', { name: ETAPE_2 });
    expect(
      within(fenetre()).getByRole('combobox', { name: 'Séparateur des colonnes' }),
    ).toHaveDisplayValue('Automatique');
  });

  it('US31 : pendant la relecture due au séparateur, les menus des colonnes, lues avec l’ancien séparateur, sont inactifs', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const analyses = servirLAnalyseEnRetenant(2, (rang) => ({
      ...analyseDeTest(),
      separateur: rang === 2 ? ',' : ';',
    }));
    render(<PageClients />);
    await analyserLeFichier(utilisateur);

    await utilisateur.selectOptions(
      within(fenetre()).getByRole('combobox', { name: 'Séparateur des colonnes' }),
      'Virgule (,)',
    );

    await waitFor(() => expect(analyses.recues).toHaveLength(2));
    expect(menuDeLaColonne('remarque')).toBeDisabled();
    analyses.liberer();
    await waitFor(() => expect(menuDeLaColonne('remarque')).toBeEnabled());
    expect(within(fenetre()).getByText('Séparateur lu : virgule.')).toBeInTheDocument();
    expect(analyses.recues).toHaveLength(2);
  });
});

describe('import des clients : refus du fichier (US31)', () => {
  it('US31 : un champ obligatoire sans colonne affiche le 400 tel quel et l’aide pour renommer la colonne', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const messages = [
      'Aucune colonne pour le champ obligatoire telephone',
      'Aucune colonne pour nomClient ni pour raisonSociale : l’un des deux est obligatoire',
    ];
    const analyses = enregistrerLesRequetes(
      'post',
      '/clients/import/analysis',
      refus(400, messages),
    );
    const imports = servirLImport();
    render(<PageClients />);
    await ouvrirLImport(utilisateur);
    await choisirLeFichier(utilisateur);
    await within(fenetre()).findByText('clients.csv');

    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Analyser le fichier' }));

    const alerte = await within(fenetre()).findByRole('alert');
    expect(alerte.querySelector('p')?.textContent).toBe(messages.join('\n'));
    expect(alerte).toHaveTextContent(
      /Renommez la colonne dans votre fichier .*, puis choisissez-le de nouveau\./,
    );
    expect(screen.getByRole('dialog', { name: ETAPE_1 })).toBeInTheDocument();
    expect(within(fenetre()).getByLabelText('Fichier CSV')).toHaveAccessibleDescription(
      expect.stringContaining(messages[0]),
    );
    expect(analyses).toHaveLength(1);
    expect(imports).toHaveLength(0);
  });

  it('US31 : après un refus, choisir de nouveau le même fichier le relit et permet de relancer l’analyse', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    enregistrerLesRequetes(
      'post',
      '/clients/import/analysis',
      refus(400, ['Aucune colonne pour le champ obligatoire telephone']),
    );
    render(<PageClients />);
    await ouvrirLImport(utilisateur);
    // Le même objet File, comme le navigateur pour un même nom : user-event, comme lui, ne
    // signale pas un choix identique à celui que le champ contient déjà.
    const fichier = fichierCsv();
    await choisirLeFichier(utilisateur, fichier);
    await within(fenetre()).findByText('clients.csv');
    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Analyser le fichier' }));
    await within(fenetre()).findByRole('alert');
    const analyses = servirLAnalyse();

    await choisirLeFichier(utilisateur, fichier);

    await waitFor(() => expect(within(fenetre()).queryByRole('alert')).not.toBeInTheDocument());
    await within(fenetre()).findByText('clients.csv');
    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Analyser le fichier' }));
    await screen.findByRole('dialog', { name: ETAPE_2 });
    expect(analyses).toHaveLength(1);
    expect(corps(analyses[0])).toEqual({ contenu: CSV });
  });

  it('US31 : un fichier de plus de 1 000 000 octets est refusé sans aucune requête', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const analyses = servirLAnalyse();
    render(<PageClients />);
    await ouvrirLImport(utilisateur);

    await choisirLeFichier(utilisateur, fichierCsv('a'.repeat(1_000_001), 'gros.csv'));

    expect(await within(fenetre()).findByRole('alert')).toHaveTextContent(
      'Le fichier dépasse la taille acceptée (1 Mo).',
    );
    expect(within(fenetre()).queryByText('gros.csv')).not.toBeInTheDocument();
    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Analyser le fichier' }));
    expect(within(fenetre()).getByRole('alert')).toHaveTextContent(
      'Choisissez d’abord un fichier CSV.',
    );
    expect(analyses).toHaveLength(0);
  });

  it('RG27 : un fichier qui n’est pas en UTF-8 est refusé avant envoi avec le message de l’API', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    const analyses = servirLAnalyse();
    render(<PageClients />);
    await ouvrirLImport(utilisateur);
    // « é » en Windows-1252 (0xE9) : un octet invalide en UTF-8.
    const windows1252 = new Uint8Array([0x6e, 0x6f, 0x6d, 0x0a, 0x50, 0x61, 0x79, 0x65, 0xe9]);

    await choisirLeFichier(utilisateur, fichierCsv(windows1252));

    const alerte = await within(fenetre()).findByRole('alert');
    expect(alerte).toHaveTextContent('Enregistrez le fichier au format CSV UTF-8');
    expect(alerte).toHaveTextContent('CSV UTF-8 (délimité par des virgules)');
    expect(analyses).toHaveLength(0);
  });

  it('US31 : un 413 de l’API affiche un message clair plutôt que son texte technique', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    enregistrerLesRequetes(
      'post',
      '/clients/import/analysis',
      refus(413, 'request entity too large'),
    );
    render(<PageClients />);
    await ouvrirLImport(utilisateur);
    await choisirLeFichier(utilisateur);
    await within(fenetre()).findByText('clients.csv');

    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Analyser le fichier' }));

    const alerte = await within(fenetre()).findByRole('alert');
    expect(alerte).toHaveTextContent('Le fichier dépasse la taille acceptée (1 Mo).');
    expect(alerte).not.toHaveTextContent('request entity too large');
  });

  it('US31 : une cellule « <b>x</b> » s’affiche comme du texte, jamais comme du HTML', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    servirLAnalyse();
    render(<PageClients />);

    await analyserLeFichier(utilisateur);

    const apercu = within(fenetre()).getByRole('region', { name: 'Aperçu du fichier' });
    expect(within(apercu).getByRole('cell', { name: '<b>x</b>' })).toBeInTheDocument();
    expect(fenetre().querySelector('b')).toBeNull();
    expect(within(apercu).getByRole('rowheader', { name: '2' })).toBeInTheDocument();
  });
});

describe('import des clients : échecs et fermeture (US31)', () => {
  it('RG29 : une erreur du serveur à l’import dit qu’aucun client n’a été enregistré, garde l’analyse et ne relit pas la liste', async () => {
    const utilisateur = userEvent.setup();
    const lectures = servirLesClients(clientsDeTest());
    servirLAnalyse();
    enregistrerLesRequetes('post', '/clients/import', refus(500, 'Internal server error'));
    render(<PageClients />);
    await analyserLeFichier(utilisateur);

    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Importer 1 ligne' }));

    const alerte = await within(fenetre()).findByRole('alert');
    expect(alerte).toHaveTextContent(
      'L’import a échoué : aucun client du fichier n’a été enregistré. Réessayez plus tard.',
    );
    expect(alerte).not.toHaveTextContent('Internal server error');
    expect(screen.getByRole('dialog', { name: ETAPE_2 })).toBeInTheDocument();
    expect(within(fenetre()).getByRole('button', { name: 'Importer 1 ligne' })).not.toHaveAttribute(
      'aria-disabled',
    );

    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Fermer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(lectures).toHaveLength(1);
  });

  it('US31 : le refus d’un import déjà en cours (409) s’affiche tel quel', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    servirLAnalyse();
    const message = 'Un import est déjà en cours, réessayez dans un instant.';
    enregistrerLesRequetes('post', '/clients/import', refus(409, message));
    render(<PageClients />);
    await analyserLeFichier(utilisateur);

    await utilisateur.click(within(fenetre()).getByRole('button', { name: 'Importer 1 ligne' }));

    expect((await within(fenetre()).findByRole('alert')).textContent).toBe(message);
  });

  it('US31 : fermer l’assistant sans importer ne relit pas la liste et rend le focus au bouton', async () => {
    const utilisateur = userEvent.setup();
    const lectures = servirLesClients(clientsDeTest());
    const analyses = servirLAnalyse();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);

    await utilisateur.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer' })).toHaveFocus();
    expect(lectures).toHaveLength(1);
    expect(analyses).toHaveLength(1);
    expect(screen.queryByText(/^Import terminé/)).not.toBeInTheDocument();
  });

  it('US31 : « Choisir un autre fichier » revient à l’étape 1, focus sur son titre, sans fichier retenu', async () => {
    const utilisateur = userEvent.setup();
    servirLesClients(clientsDeTest());
    servirLAnalyse();
    render(<PageClients />);
    await analyserLeFichier(utilisateur);

    await utilisateur.click(
      within(fenetre()).getByRole('button', { name: 'Choisir un autre fichier' }),
    );

    expect(screen.getByRole('heading', { level: 2, name: ETAPE_1 })).toHaveFocus();
    expect(within(fenetre()).queryByText('clients.csv')).not.toBeInTheDocument();
  });
});
