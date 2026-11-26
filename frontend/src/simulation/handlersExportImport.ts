import { http, type HttpHandler, HttpResponse } from 'msw';
import type {
  Adresse,
  Client,
  Correspondance,
  DemandeAnalyse,
  DemandeImport,
  LigneImportee,
  ModificationClient,
  NouvelleAdresse,
  RapportImport,
  SeparateurCsv,
  StrategieDoublons,
} from '../api/types';
import { jourMetier } from '../commun/dates';
import {
  analyserLignes,
  type FichierPrepare,
  type LigneAnalysee,
  preparerFichier,
  versReponseAnalyse,
} from './analyseImportSimulee';
import { BOM, type CelluleCsv, ecrireCsv } from './csvSimule';
import type { JeuDeDemonstration } from './donneesDemonstration';
import {
  adressesActives,
  type ContexteDesClients,
  creerAdresse,
  lireCriteresExport,
  listerClients,
  modifierClient,
  nouveauClientDuJeu,
  type NouveauClientLu,
  type SequencesDesClients,
} from './handlersClients';
import {
  type Champs,
  lireCorps,
  lireEnumeration,
  lireObjet,
  refuser,
  repondre,
  RequeteRefusee,
  signalerErreurs,
} from './validationSimulee';

/*
 * Simulation de l'export et de l'import CSV des clients (docs/api.md, 6.12 et 6.13 ; back :
 * backend/src/clients/export-clients.ts, import/) : un vrai fichier CSV à télécharger, puis
 * l'analyse et l'import d'un fichier qui créent ou mettent à jour les clients du jeu, visibles
 * ensuite dans GET /clients. Les contrôles et leurs messages sont ceux du back ; le journal
 * (RG25), le verrou et la transaction (RG29) n'ont pas lieu d'être ici.
 */

interface Options {
  urlApi: (chemin: string) => string;
  maintenant?: () => Date;
  /** Celles de creerHandlersClients sur le même jeu : creerHandlersDeSimulation les partage. */
  sequences: SequencesDesClients;
}

// ---------- Export (US32, export-clients.ts) ----------

/** Noms reconnus par l'import : un export réimporté sans modification ne crée aucun client. */
const COLONNES_EXPORT_CLIENTS = [
  'id',
  'type_client',
  'nom',
  'prenom',
  'raison_sociale',
  'telephone',
  'email',
  'rue',
  'complement',
  'code_postal',
  'ville',
  'infos_acces',
  'archive',
  'cree_le',
];

const LIMITE_DE_LIGNES_EXPORT = 5000;

/**
 * Une ligne par adresse en service, dans l'ordre de la liste puis des adresses. Un client sans
 * adresse en service sort sur une ligne aux colonnes d'adresse vides : il n'est pas perdu.
 */
function versLignesCsv(clients: readonly Client[]): CelluleCsv[][] {
  return clients.flatMap((client) =>
    client.adresses.length === 0
      ? [versLigne(client, null)]
      : client.adresses.map((adresse) => versLigne(client, adresse)),
  );
}

function versLigne(client: Client, adresse: Adresse | null): CelluleCsv[] {
  return [
    client.id,
    client.typeClient,
    client.nomClient,
    client.prenomClient,
    client.raisonSociale,
    client.telephone,
    client.emailClient,
    adresse?.rue ?? null,
    adresse?.complement ?? null,
    adresse?.codePostal ?? null,
    adresse?.ville ?? null,
    adresse?.infosAcces ?? null,
    client.archive ? 'oui' : 'non',
    jourMetier(client.creeLe),
  ];
}

/** Un client donne au moins une ligne : compter les lignes suffit aux deux contrôles du back. */
function verifierLimiteExport(nombreDeLignes: number): void {
  if (nombreDeLignes > LIMITE_DE_LIGNES_EXPORT) {
    throw refuser('L’export dépasse 5 000 lignes : affinez les filtres.');
  }
}

/**
 * En-têtes de l'API : Content-Type et Content-Disposition viennent de versReponseCsv
 * (backend/src/commun/csv/fichier-csv.ts), Cache-Control du @Header de clients.controller.ts.
 */
function enTetesDuFichier(maintenant: Date): Record<string, string> {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    // Le jour est celui de La Réunion, pas celui du poste en UTC.
    'Content-Disposition': `attachment; filename="clients-${jourMetier(maintenant)}.csv"`,
    // Le fichier contient des données personnelles : il ne reste dans aucun cache.
    'Cache-Control': 'no-store',
  };
}

// ---------- Corps des routes d'import (import-clients.validation.ts) ----------

// 1 Mo de fichier : le corps JSON qui le porte est limité à 1,5 Mo par l'API (413 au-delà).
const LONGUEUR_CONTENU_MAXIMUM = 1_000_000;
const SEPARATEURS: readonly SeparateurCsv[] = [';', ','];
const STRATEGIES_DOUBLONS: readonly StrategieDoublons[] = ['IGNORER', 'METTRE_A_JOUR'];
const CHAMPS_ANALYSE = ['contenu', 'separateur', 'correspondance'] as const;

/** POST /clients/import/analysis : strategieDoublons y est refusée, rien n'est enregistré. */
function lireDemandeAnalyse(corps: unknown): DemandeAnalyse {
  const champs = lireObjet(corps, CHAMPS_ANALYSE);
  const erreurs: string[] = [];
  const demande = lireChampsCommuns(champs, erreurs);
  signalerErreurs(erreurs);
  return demande;
}

/** POST /clients/import : la stratégie des doublons est un choix explicite (RG28). */
function lireDemandeImport(corps: unknown): DemandeImport {
  const champs = lireObjet(corps, [...CHAMPS_ANALYSE, 'strategieDoublons']);
  const erreurs: string[] = [];
  const demande = lireChampsCommuns(champs, erreurs);
  const strategieDoublons = lireEnumeration(
    champs,
    'strategieDoublons',
    STRATEGIES_DOUBLONS,
    erreurs,
    { obligatoire: true },
  );
  signalerErreurs(erreurs);
  return { ...demande, strategieDoublons: strategieDoublons as StrategieDoublons };
}

/** Dans l'ordre du back, pour que les messages d'un même 400 arrivent dans le même ordre. */
function lireChampsCommuns(champs: Champs, erreurs: string[]): DemandeAnalyse {
  const contenu = lireContenu(champs.contenu, erreurs) ?? '';
  const separateur = lireEnumeration(champs, 'separateur', SEPARATEURS, erreurs, {
    obligatoire: false,
  });
  const correspondance = lireCorrespondance(champs.correspondance, erreurs);
  return { contenu, separateur, correspondance };
}

/** Le texte du fichier n'est ni réduit ni transformé : un espace fait partie des données. */
function lireContenu(valeur: unknown, erreurs: string[]): string | undefined {
  if (valeur === undefined || valeur === null) {
    erreurs.push('contenu est obligatoire');
  } else if (typeof valeur !== 'string') {
    erreurs.push('contenu doit être un texte');
  } else if (valeur.length > LONGUEUR_CONTENU_MAXIMUM) {
    erreurs.push('contenu ne doit pas dépasser 1 000 000 caractères');
  } else if (valeur.includes('\uFFFD')) {
    // Le navigateur décode en UTF-8 : ce caractère de remplacement trahit un autre encodage.
    erreurs.push('Enregistrez le fichier au format CSV UTF-8');
  } else if (valeur.includes('\u0000')) {
    erreurs.push('contenu contient un caractère non autorisé');
  } else {
    return valeur;
  }
  return undefined;
}

/** { "<en-tête du fichier>": "<champ client>" | null } ; champs vérifiés avec le fichier. */
function lireCorrespondance(valeur: unknown, erreurs: string[]): Correspondance | undefined {
  if (valeur === undefined) return undefined;
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
    erreurs.push('correspondance doit être un objet');
    return undefined;
  }
  if (!Object.values(valeur).every((champ) => champ === null || typeof champ === 'string')) {
    erreurs.push('correspondance doit associer chaque en-tête à un champ client ou à null');
    return undefined;
  }
  return valeur as Correspondance;
}

// ---------- Enregistrement de l'import (import-clients.service.ts) ----------

type Doublon = Extract<LigneAnalysee, { resultat: 'DOUBLON' }>;

/**
 * L'import refait toute l'analyse : il ne fait pas confiance à l'aperçu. Comme le back, les
 * créations passent d'abord, puis les mises à jour ; chaque ligne garde son rang dans le rapport.
 */
function importerLesLignes(
  contexte: ContexteDesClients,
  fichier: FichierPrepare,
  strategie: StrategieDoublons,
): RapportImport {
  const analysees = analyserLignes(fichier.lignes, contexte.jeu.clients);
  const lignes: LigneImportee[] = [];
  const aMettreAJour: { rang: number; doublon: Doublon }[] = [];
  analysees.forEach((ligne, rang) => {
    if (ligne.resultat === 'DOUBLON' && strategie === 'METTRE_A_JOUR' && !ligne.clientArchive) {
      aMettreAJour.push({ rang, doublon: ligne });
    } else {
      lignes[rang] = enregistrerSansMiseAJour(contexte, ligne);
    }
  });
  for (const { rang, doublon } of aMettreAJour) {
    lignes[rang] = mettreAJour(contexte, doublon);
  }
  return { totaux: compter(lignes), lignes };
}

function enregistrerSansMiseAJour(
  contexte: ContexteDesClients,
  ligne: LigneAnalysee,
): LigneImportee {
  switch (ligne.resultat) {
    case 'INVALIDE':
      return { numero: ligne.numero, resultat: 'REJETE', erreurs: ligne.erreurs };
    case 'VALIDE':
      return { numero: ligne.numero, resultat: 'CREE', clientId: creer(contexte, ligne.client) };
    case 'DOUBLON':
      // Un client archivé n'est jamais touché, quelle que soit la stratégie (RG28).
      return {
        numero: ligne.numero,
        resultat: 'IGNORE',
        clientId: ligne.clientId,
        motif: ligne.motif,
      };
  }
}

/** Comme POST /clients (RG21) : le client et sa première adresse. */
function creer(contexte: ContexteDesClients, nouveau: NouveauClientLu): number {
  const client = nouveauClientDuJeu(contexte, nouveau);
  contexte.jeu.clients.push(client);
  return client.id;
}

/**
 * RG28 : seuls les champs renseignés de la ligne remplacent ceux du client (une cellule vide ne
 * vide rien) ; le type ne change que s'il est dans le fichier ; la règle nom / raison sociale est
 * vérifiée sur le client mis à jour ; une adresse nouvelle est ajoutée, aucune n'est modifiée.
 */
function mettreAJour(contexte: ContexteDesClients, doublon: Doublon): LigneImportee {
  const client = clientDuDoublon(contexte.jeu, doublon.clientId);
  const modification = champsModifies(client, doublon);
  try {
    // Sans champ qui diffère, rien n'est écrit, mais la ligne reste MIS_A_JOUR (docs/api.md, 6.13).
    if (Object.keys(modification).length > 0) modifierClient(contexte, client, modification);
  } catch (echec) {
    if (echec instanceof RequeteRefusee) {
      return { numero: doublon.numero, resultat: 'REJETE', erreurs: echec.messages };
    }
    throw echec;
  }
  ajouterLAdresseSiNouvelle(contexte, client, doublon.client.adresse);
  return { numero: doublon.numero, resultat: 'MIS_A_JOUR', clientId: client.id };
}

/** L'analyse vient de trouver ce client dans le jeu, d'où rien n'est jamais retiré. */
function clientDuDoublon(jeu: JeuDeDemonstration, id: number): Client {
  const client = jeu.clients.find((candidat) => candidat.id === id);
  if (client === undefined) throw new Error(`Client ${id} d’un doublon absent du jeu simulé`);
  return client;
}

/** Champs non vides de la ligne qui diffèrent du client. */
function champsModifies(client: Client, doublon: Doublon): ModificationClient {
  const { typeClient, nomClient, prenomClient, raisonSociale, telephone, emailClient } =
    doublon.client;
  const proposes: ModificationClient = {
    ...(doublon.typeRenseigne ? { typeClient } : {}),
    ...(nomClient === null ? {} : { nomClient }),
    ...(prenomClient === null ? {} : { prenomClient }),
    ...(raisonSociale === null ? {} : { raisonSociale }),
    telephone,
    ...(emailClient === null ? {} : { emailClient }),
  };
  return Object.fromEntries(
    Object.entries(proposes).filter(
      ([champ, valeur]) => client[champ as keyof ModificationClient] !== valeur,
    ),
  );
}

/** Même rue, code postal et ville, sans tenir compte de la casse ni des espaces en trop. */
function ajouterLAdresseSiNouvelle(
  contexte: ContexteDesClients,
  client: Client,
  adresse: NouvelleAdresse,
): void {
  const cle = cleDAdresse(adresse);
  if (adressesActives(client).some((connue) => cleDAdresse(connue) === cle)) return;
  client.adresses.push(creerAdresse(adresse, contexte.prochainIdAdresse()));
}

type LieuDeLAdresse = Pick<Adresse, 'rue' | 'codePostal' | 'ville'>;

function cleDAdresse({ rue, codePostal, ville }: LieuDeLAdresse): string {
  return [rue, codePostal, ville]
    .map((morceau) => morceau.trim().replace(/\s+/g, ' ').toLowerCase())
    .join('|');
}

function compter(lignes: readonly LigneImportee[]): RapportImport['totaux'] {
  const nombre = (resultat: LigneImportee['resultat']) =>
    lignes.filter((ligne) => ligne.resultat === resultat).length;
  return {
    crees: nombre('CREE'),
    misAJour: nombre('MIS_A_JOUR'),
    ignores: nombre('IGNORE'),
    rejetes: nombre('REJETE'),
  };
}

// ---------- Routes ----------

function routeDeLExport(contexte: ContexteDesClients, urlApi: Options['urlApi']): HttpHandler {
  return http.get(urlApi('/clients/export'), ({ request }) =>
    repondre(() => {
      const clients = listerClients(contexte.jeu, lireCriteresExport(request));
      const lignes = versLignesCsv(clients);
      verifierLimiteExport(lignes.length);
      // Le BOM part en tête du corps : la réponse l'encode en UTF-8 (EF BB BF) comme l'API.
      return HttpResponse.text(BOM + ecrireCsv(COLONNES_EXPORT_CLIENTS, lignes), {
        headers: enTetesDuFichier(contexte.maintenant()),
      });
    }),
  );
}

function routesDeLImport(contexte: ContexteDesClients, urlApi: Options['urlApi']): HttpHandler[] {
  return [
    http.post(urlApi('/clients/import/analysis'), ({ request }) =>
      repondre(async () => {
        const fichier = preparerFichier(lireDemandeAnalyse(await lireCorps(request)));
        const lignes = analyserLignes(fichier.lignes, contexte.jeu.clients);
        return HttpResponse.json(versReponseAnalyse(fichier, lignes));
      }),
    ),
    http.post(urlApi('/clients/import'), ({ request }) =>
      repondre(async () => {
        const demande = lireDemandeImport(await lireCorps(request));
        const fichier = preparerFichier(demande);
        return HttpResponse.json(importerLesLignes(contexte, fichier, demande.strategieDoublons));
      }),
    ),
  ];
}

/**
 * À placer avant creerHandlersClients : MSW répond avec la première route qui correspond, et
 * GET /clients/:id lirait « export » comme un identifiant (400), comme Nest si la route du back
 * était déclarée après.
 */
export function creerHandlersExportImport(
  jeu: JeuDeDemonstration,
  { urlApi, maintenant = () => new Date(), sequences }: Options,
): HttpHandler[] {
  const contexte: ContexteDesClients = { jeu, maintenant, ...sequences };
  return [routeDeLExport(contexte, urlApi), ...routesDeLImport(contexte, urlApi)];
}
