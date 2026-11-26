import type {
  ChampClient,
  Client,
  Correspondance,
  DemandeAnalyse,
  LigneAnalysee as LigneAnalyseeApi,
  LigneCsv,
  ReponseAnalyse,
  SeparateurCsv,
} from '../api/types';
import { lireCsv } from './csvSimule';
import { lireNouveauClient, type NouveauClientLu } from './handlersClients';
import { RequeteRefusee, refuser } from './validationSimulee';

/*
 * Analyse d'un fichier de clients à importer (US31, RG27, RG28), recopiée du back
 * (backend/src/clients/import/correspondance-colonnes.ts et analyse-import.ts) : correspondance
 * des colonnes, validation de chaque ligne comme un corps de POST /clients, doublons. Elle n'écrit
 * rien : l'aperçu s'en sert tel quel, l'import la refait avant d'enregistrer.
 *
 * Les motifs de rejet nomment le champ et la règle, jamais la valeur d'une cellule.
 */

// ---------- Correspondance des colonnes (correspondance-colonnes.ts) ----------

const CHAMPS_CLIENT: readonly ChampClient[] = [
  'typeClient',
  'nomClient',
  'prenomClient',
  'raisonSociale',
  'telephone',
  'emailClient',
  'rue',
  'complement',
  'codePostal',
  'ville',
  'infosAcces',
];

/** En-têtes reconnus, déjà normalisés (voir normaliserEnTete). */
const SYNONYMES: Record<ChampClient, readonly string[]> = {
  typeClient: ['type', 'typeclient'],
  nomClient: ['nom', 'nomclient'],
  prenomClient: ['prenom', 'prenomclient'],
  raisonSociale: ['raisonsociale', 'societe', 'entreprise'],
  telephone: ['telephone', 'tel', 'mobile', 'portable', 'numerodecontact'],
  emailClient: ['email', 'mail', 'courriel'],
  rue: ['rue', 'adresse', 'adresse1'],
  complement: ['complement', 'adresse2'],
  codePostal: ['codepostal', 'cp'],
  ville: ['ville', 'commune'],
  infosAcces: ['infosacces', 'acces', 'digicode'],
};

const CHAMP_DU_SYNONYME = new Map<string, ChampClient>(
  CHAMPS_CLIENT.flatMap((champ) => SYNONYMES[champ].map((synonyme) => [synonyme, champ] as const)),
);

const CHAMPS_OBLIGATOIRES: readonly ChampClient[] = ['telephone', 'rue', 'codePostal', 'ville'];

interface CorrespondanceEtablie {
  correspondance: Correspondance;
  colonnesIgnorees: string[];
  /** Champ de chaque colonne, dans l'ordre du fichier. */
  champsParColonne: (ChampClient | null)[];
}

/** « Tél. », « TELEPHONE » et « télé-phone » deviennent « telephone ». */
function normaliserEnTete(enTete: string): string {
  return enTete
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[\s_.-]/g, '');
}

/**
 * Les choix explicites l'emportent ; les autres colonnes reçoivent la proposition. Si deux
 * colonnes se proposent pour le même champ (Tel et Mobile), la première le prend et la seconde
 * est ignorée. 400 si le fichier ou la correspondance envoyée rend l'import impossible.
 */
function etablirCorrespondance(
  enTetes: readonly string[],
  explicite: Correspondance = {},
): CorrespondanceEtablie {
  verifierEnTetesUniques(enTetes);
  const choix = lireChoixExplicites(enTetes, explicite);
  const champsParColonne = attribuerLesChamps(enTetes, choix);
  verifierChampsObligatoires(champsParColonne);
  return {
    correspondance: Object.fromEntries(enTetes.map((enTete, i) => [enTete, champsParColonne[i]])),
    colonnesIgnorees: enTetes.filter((_enTete, i) => champsParColonne[i] === null),
    champsParColonne,
  };
}

/** Deux colonnes au même en-tête rendraient la correspondance ambiguë. */
function verifierEnTetesUniques(enTetes: readonly string[]): void {
  const erreurs = enTetes.flatMap((enTete, rang) => {
    const premiere = enTetes.indexOf(enTete);
    return premiere < rang
      ? [`Les colonnes ${premiere + 1} et ${rang + 1} portent le même en-tête`]
      : [];
  });
  signalerSiNecessaire(erreurs);
}

/** Choix envoyés, vérifiés : en-tête présent, champ connu, champ choisi une seule fois. */
function lireChoixExplicites(
  enTetes: readonly string[],
  explicite: Correspondance,
): Map<string, ChampClient | null> {
  const erreurs: string[] = [];
  const choix = new Map<string, ChampClient | null>();
  for (const [enTete, champ] of Object.entries(explicite)) {
    if (!enTetes.includes(enTete)) {
      erreurs.push(`correspondance cite un en-tête absent du fichier : « ${enTete} »`);
    } else if (champ !== null && !CHAMPS_CLIENT.includes(champ)) {
      erreurs.push(`correspondance « ${enTete} » doit valoir ${CHAMPS_CLIENT.join(', ')} ou null`);
    } else {
      choix.set(enTete, champ);
    }
  }
  erreurs.push(...champsChoisisPlusieursFois([...choix.values()]));
  signalerSiNecessaire(erreurs);
  return choix;
}

function champsChoisisPlusieursFois(champs: (ChampClient | null)[]): string[] {
  const choisis = champs.filter((champ) => champ !== null);
  return [...new Set(choisis)]
    .filter((champ) => choisis.filter((autre) => autre === champ).length > 1)
    .map((champ) => `Le champ ${champ} est choisi pour plusieurs colonnes`);
}

function attribuerLesChamps(
  enTetes: readonly string[],
  choix: Map<string, ChampClient | null>,
): (ChampClient | null)[] {
  const pris = new Set([...choix.values()].filter((champ) => champ !== null));
  return enTetes.map((enTete) => {
    if (choix.has(enTete)) return choix.get(enTete) ?? null;
    const propose = CHAMP_DU_SYNONYME.get(normaliserEnTete(enTete));
    if (propose === undefined || pris.has(propose)) return null;
    pris.add(propose);
    return propose;
  });
}

/** US31 : téléphone, rue, code postal, ville, et nom ou raison sociale. */
function verifierChampsObligatoires(champs: readonly (ChampClient | null)[]): void {
  const erreurs = CHAMPS_OBLIGATOIRES.filter((champ) => !champs.includes(champ)).map(
    (champ) => `Aucune colonne pour le champ obligatoire ${champ}`,
  );
  if (!champs.includes('nomClient') && !champs.includes('raisonSociale')) {
    erreurs.push(
      'Aucune colonne pour nomClient ni pour raisonSociale : l’un des deux est obligatoire',
    );
  }
  signalerSiNecessaire(erreurs);
}

/** Comme le back, une erreur sur le fichier entier est un 400 dont le message est un tableau. */
function signalerSiNecessaire(erreurs: string[]): void {
  if (erreurs.length > 0) throw refuser(erreurs);
}

// ---------- Préparation du fichier (analyse-import.ts) ----------

const LIGNES_DE_DONNEES_MAXIMUM = 1000;
const LIGNES_DE_L_APERCU = 10;

const CHAMPS_IDENTITE: readonly ChampClient[] = [
  'typeClient',
  'nomClient',
  'prenomClient',
  'raisonSociale',
  'telephone',
  'emailClient',
];
const CHAMPS_ADRESSE: readonly ChampClient[] = [
  'rue',
  'complement',
  'codePostal',
  'ville',
  'infosAcces',
];

// Apostrophe ajoutée par la neutralisation des formules de l'export (RG26) : retirée à l'import.
const FORMULE_NEUTRALISEE = /^'[=+\-@]/;

type ValeursDeLaLigne = Partial<Record<ChampClient, string>>;

/** Ligne lue et validée ; ses doublons ne sont pas encore cherchés. */
type LignePreparee =
  | { numero: number; erreurs: string[] }
  | {
      numero: number;
      client: NouveauClientLu;
      /** Faux si le type a été déduit : une mise à jour ne change alors pas le type (RG28). */
      typeRenseigne: boolean;
    };

type LigneValide = Extract<LignePreparee, { client: unknown }>;

export interface FichierPrepare {
  separateur: SeparateurCsv;
  enTetes: string[];
  correspondance: Correspondance;
  colonnesIgnorees: string[];
  /** Les premières lignes de données, telles que lues. */
  apercu: LigneCsv[];
  lignes: LignePreparee[];
}

/** Lecture du fichier, correspondance des colonnes et validation de chaque ligne. */
export function preparerFichier(demande: DemandeAnalyse): FichierPrepare {
  const csv = lireCsv(demande.contenu, demande.separateur);
  verifierNombreDeLignes(csv.lignes.length);
  const { correspondance, colonnesIgnorees, champsParColonne } = etablirCorrespondance(
    csv.enTetes,
    demande.correspondance,
  );
  return {
    separateur: csv.separateur,
    enTetes: csv.enTetes,
    correspondance,
    colonnesIgnorees,
    apercu: csv.lignes.slice(0, LIGNES_DE_L_APERCU),
    lignes: csv.lignes.map((ligne) => preparerLigne(ligne, champsParColonne)),
  };
}

function verifierNombreDeLignes(nombre: number): void {
  if (nombre === 0) throw refuser(['Le fichier ne contient aucune ligne de données']);
  if (nombre > LIGNES_DE_DONNEES_MAXIMUM) {
    throw refuser(['Le fichier dépasse 1 000 lignes de données']);
  }
}

function preparerLigne(
  ligne: LigneCsv,
  champsParColonne: readonly (ChampClient | null)[],
): LignePreparee {
  if (ligne.cellules.length !== champsParColonne.length) {
    const attendu = champsParColonne.length;
    return {
      numero: ligne.numero,
      erreurs: [`La ligne a ${ligne.cellules.length} colonnes au lieu de ${attendu}`],
    };
  }
  const valeurs = lireValeurs(ligne.cellules, champsParColonne);
  try {
    const client = lireNouveauClient(versCorpsDeCreation(valeurs));
    return { numero: ligne.numero, client, typeRenseigne: valeurs.typeClient !== undefined };
  } catch (echec) {
    if (echec instanceof RequeteRefusee) return { numero: ligne.numero, erreurs: motifs(echec) };
    throw echec;
  }
}

/** Cellule vide ou blanche = champ absent ; apostrophe de neutralisation retirée. */
function lireValeurs(
  cellules: readonly string[],
  champsParColonne: readonly (ChampClient | null)[],
): ValeursDeLaLigne {
  const valeurs: ValeursDeLaLigne = {};
  champsParColonne.forEach((champ, rang) => {
    const cellule = cellules[rang].trim();
    if (champ !== null && cellule !== '') {
      valeurs[champ] = FORMULE_NEUTRALISEE.test(cellule) ? cellule.slice(1) : cellule;
    }
  });
  return valeurs;
}

/**
 * Corps de POST /clients : la ligne passe par la même validation qu'un client saisi (RG27).
 * Sans type, une ligne avec une raison sociale et sans nom est un professionnel.
 */
function versCorpsDeCreation(valeurs: ValeursDeLaLigne): Record<string, unknown> {
  const typeDeduit =
    valeurs.raisonSociale !== undefined && valeurs.nomClient === undefined
      ? 'PROFESSIONNEL'
      : 'PARTICULIER';
  return {
    ...choisir(valeurs, CHAMPS_IDENTITE),
    typeClient: valeurs.typeClient?.toUpperCase() ?? typeDeduit,
    adresse: choisir(valeurs, CHAMPS_ADRESSE),
  };
}

function choisir(
  valeurs: ValeursDeLaLigne,
  champs: readonly ChampClient[],
): Record<string, string> {
  return Object.fromEntries(
    champs.flatMap((champ) => (valeurs[champ] === undefined ? [] : [[champ, valeurs[champ]]])),
  );
}

/** Le motif nomme le champ de la correspondance (codePostal), pas celui du corps imbriqué. */
function motifs(echec: RequeteRefusee): string[] {
  return echec.messages.map((message) => message.replace(/^adresse\./, ''));
}

// ---------- Doublons (RG28, analyse-import.ts) ----------

export const MOTIF_CLIENT_ARCHIVE = 'Client archivé : il ne sera pas mis à jour';
const MOTIF_DEUX_CLIENTS = 'Correspond à deux clients différents';

/** Client du jeu dont le téléphone ou l'e-mail peut être celui d'une ligne du fichier. */
type ClientExistant = Pick<Client, 'id' | 'telephone' | 'emailClient' | 'archive'>;

export type LigneAnalysee =
  | { numero: number; resultat: 'VALIDE'; client: NouveauClientLu }
  | {
      numero: number;
      resultat: 'DOUBLON';
      clientId: number;
      motif: string;
      clientArchive: boolean;
      client: NouveauClientLu;
      typeRenseigne: boolean;
    }
  | { numero: number; resultat: 'INVALIDE'; erreurs: string[] };

/** Téléphone ou e-mail déjà porté par une ligne précédente, et le client qu'il désigne. */
interface Reservation {
  numero: number;
  champ: 'téléphone' | 'e-mail';
  /** null : nouveau client créé par la ligne ; sinon le client existant dont elle est doublon. */
  client: Pick<ClientExistant, 'id' | 'archive'> | null;
}

/** Clés « telephone:0692123456 » et « email:marie@exemple.re ». */
type Reservations = Map<string, Reservation>;

/**
 * Une ligne dont le téléphone ou l'e-mail est celui d'un client existant (archivé compris) en est
 * le doublon ; plusieurs lignes peuvent désigner le même client existant (export réimporté, une
 * ligne par adresse). Pour un client absent du jeu, la première ligne valide gagne et les
 * suivantes sont rejetées. Chaque ligne valide ou doublon réserve son téléphone et son e-mail
 * pour les lignes suivantes, sinon deux clients finiraient avec le même e-mail.
 */
export function analyserLignes(
  lignes: readonly LignePreparee[],
  existants: readonly ClientExistant[],
): LigneAnalysee[] {
  const reservations: Reservations = new Map();
  return lignes.map((ligne) => {
    if ('erreurs' in ligne) {
      return { numero: ligne.numero, resultat: 'INVALIDE', erreurs: ligne.erreurs };
    }
    const analysee = chercherDoublon(ligne, existants, reservations);
    if (analysee.resultat !== 'INVALIDE') reserver(reservations, ligne, analysee);
    return analysee;
  });
}

function chercherDoublon(
  ligne: LigneValide,
  existants: readonly ClientExistant[],
  reservations: Reservations,
): LigneAnalysee {
  const { clients, parTelephone, parEmail } = clientsDesignes(ligne, existants);
  const reservees = reservationsDesignees(ligne, reservations);
  if (nombreDeCibles(clients, reservees) > 1) {
    return { numero: ligne.numero, resultat: 'INVALIDE', erreurs: [MOTIF_DEUX_CLIENTS] };
  }
  const [existant] = clients;
  if (existant !== undefined) {
    const parLeTelephone = parTelephone.includes(existant);
    const motif = motifDuDoublon(existant, parLeTelephone, parEmail.includes(existant));
    return versDoublon(ligne, existant, motif);
  }
  return selonLaLignePrecedente(ligne, reservees[0]);
}

/** Clients existants et lignes nouvelles désignés : plus d'un, la ligne est ambiguë. */
function nombreDeCibles(clients: readonly ClientExistant[], reservees: Reservation[]): number {
  return new Set([
    ...clients.map(({ id }) => `client ${id}`),
    ...reservees.map(({ numero, client }) =>
      client === null ? `ligne ${numero}` : `client ${client.id}`,
    ),
  ]).size;
}

/** Aucun client existant désigné : la ligne est neuve, ou suit une ligne précédente. */
function selonLaLignePrecedente(
  ligne: LigneValide,
  reservee: Reservation | undefined,
): LigneAnalysee {
  if (reservee === undefined) {
    return { numero: ligne.numero, resultat: 'VALIDE', client: ligne.client };
  }
  const { numero: precedente, champ, client } = reservee;
  if (client === null) {
    const erreurs = [`Doublon de la ligne ${precedente}`];
    return { numero: ligne.numero, resultat: 'INVALIDE', erreurs };
  }
  const motif = client.archive
    ? MOTIF_CLIENT_ARCHIVE
    : `Même ${champ} que la ligne ${precedente}, doublon du client ${client.id}`;
  return versDoublon(ligne, client, motif);
}

function versDoublon(
  ligne: LigneValide,
  client: Pick<ClientExistant, 'id' | 'archive'>,
  motif: string,
): LigneAnalysee {
  return {
    numero: ligne.numero,
    resultat: 'DOUBLON',
    clientId: client.id,
    motif,
    clientArchive: client.archive,
    client: ligne.client,
    typeRenseigne: ligne.typeRenseigne,
  };
}

/** La première ligne qui porte un téléphone ou un e-mail le garde pour la suite du fichier. */
function reserver(reservations: Reservations, ligne: LigneValide, analysee: LigneAnalysee): void {
  const client =
    analysee.resultat === 'DOUBLON'
      ? { id: analysee.clientId, archive: analysee.clientArchive }
      : null;
  for (const [cle, champ] of clesDeLaLigne(ligne)) {
    if (!reservations.has(cle)) reservations.set(cle, { numero: ligne.numero, champ, client });
  }
}

function clesDeLaLigne(ligne: LigneValide): [string, Reservation['champ']][] {
  const email = ligne.client.emailClient?.toLowerCase();
  const cles: [string, Reservation['champ']][] = [
    [`telephone:${ligne.client.telephone}`, 'téléphone'],
  ];
  if (email !== undefined) cles.push([`email:${email}`, 'e-mail']);
  return cles;
}

/** Réservations des lignes précédentes que le téléphone ou l'e-mail de la ligne retrouve. */
function reservationsDesignees(ligne: LigneValide, reservations: Reservations): Reservation[] {
  return clesDeLaLigne(ligne)
    .map(([cle]) => reservations.get(cle))
    .filter((reservation) => reservation !== undefined);
}

/** Clients existants désignés par le téléphone (normalisé) ou l'e-mail (sans casse) de la ligne. */
function clientsDesignes(ligne: LigneValide, existants: readonly ClientExistant[]) {
  const email = ligne.client.emailClient?.toLowerCase();
  const parTelephone = existants.filter((client) => client.telephone === ligne.client.telephone);
  const parEmail =
    email === undefined
      ? []
      : existants.filter((client) => client.emailClient?.toLowerCase() === email);
  const clients = [...new Set([...parTelephone, ...parEmail])];
  return { clients, parTelephone, parEmail };
}

function motifDuDoublon(client: ClientExistant, telephone: boolean, email: boolean): string {
  if (client.archive) return MOTIF_CLIENT_ARCHIVE;
  if (telephone && email) return `Même téléphone et même e-mail que le client ${client.id}`;
  return telephone
    ? `Même téléphone que le client ${client.id}`
    : `Même e-mail que le client ${client.id}`;
}

// ---------- Réponse de l'analyse ----------

/** Réponse de POST /clients/import/analysis : les données lues ne repartent que dans l'aperçu. */
export function versReponseAnalyse(
  fichier: FichierPrepare,
  lignes: readonly LigneAnalysee[],
): ReponseAnalyse {
  const nombre = (resultat: LigneAnalysee['resultat']) =>
    lignes.filter((ligne) => ligne.resultat === resultat).length;
  return {
    separateur: fichier.separateur,
    enTetes: fichier.enTetes,
    correspondance: fichier.correspondance,
    colonnesIgnorees: fichier.colonnesIgnorees,
    apercu: fichier.apercu,
    lignes: lignes.map(versLigneApi),
    totaux: {
      lignes: lignes.length,
      valides: nombre('VALIDE'),
      doublons: nombre('DOUBLON'),
      invalides: nombre('INVALIDE'),
    },
  };
}

function versLigneApi(ligne: LigneAnalysee): LigneAnalyseeApi {
  switch (ligne.resultat) {
    case 'VALIDE':
      return { numero: ligne.numero, resultat: 'VALIDE' };
    case 'DOUBLON':
      return {
        numero: ligne.numero,
        resultat: 'DOUBLON',
        clientId: ligne.clientId,
        motif: ligne.motif,
      };
    case 'INVALIDE':
      return { numero: ligne.numero, resultat: 'INVALIDE', erreurs: ligne.erreurs };
  }
}
