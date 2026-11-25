import { BadRequestException } from '@nestjs/common';
import { type LigneCsv, lireCsv } from '../../commun/csv/lire-csv.js';
import { TypeClient } from '../../generated/prisma/client.ts';
import { lireNouveauClient } from '../clients.validation.js';
import { etablirCorrespondance } from './correspondance-colonnes.js';
import type {
  ChampClient,
  ClientExistant,
  DemandeAnalyse,
  FichierPrepare,
  LigneAnalysee,
  LigneAnalyseeApi,
  LignePreparee,
  ReponseAnalyse,
} from './import-clients.types.js';

/*
 * Analyse d'un fichier de clients (US31, RG27, RG28), sans base de données : le service lui passe
 * les clients existants qu'il a trouvés, elle décide. Elle sert à l'aperçu et, refaite sous le
 * verrou de l'import, aux décisions finales.
 *
 * Les motifs de rejet nomment le champ et la règle, jamais la valeur d'une cellule.
 */

export const LIGNES_DE_DONNEES_MAXIMUM = 1000;
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

export const MOTIF_CLIENT_ARCHIVE = 'Client archivé : il ne sera pas mis à jour';
const MOTIF_DEUX_CLIENTS = 'Correspond à deux clients différents';

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

/** Téléphones (normalisés) et e-mails (en minuscules) des lignes valides, sans doublon. */
export function clesDeRecherche(fichier: FichierPrepare): {
  telephones: string[];
  emails: string[];
} {
  const telephones = new Set<string>();
  const emails = new Set<string>();
  for (const ligne of fichier.lignes) {
    if ('client' in ligne) {
      telephones.add(ligne.client.telephone);
      if (ligne.client.emailClient !== null) {
        emails.add(ligne.client.emailClient.toLowerCase());
      }
    }
  }
  return { telephones: [...telephones], emails: [...emails] };
}

/**
 * Doublons (RG28, docs/import-export-csv.md section 6) : une ligne dont le téléphone ou l'e-mail
 * est celui d'un client existant (archivé compris) en est le doublon ; plusieurs lignes peuvent
 * désigner le même client existant (export réimporté, une ligne par adresse). Pour un client
 * absent de la base, la première ligne valide gagne et les suivantes sont rejetées.
 */
export function analyserLignes(
  lignes: readonly LignePreparee[],
  existants: readonly ClientExistant[],
): LigneAnalysee[] {
  const lignesNouvelles = {
    telephones: new Map<string, number>(),
    emails: new Map<string, number>(),
  };
  return lignes.map((ligne) => {
    if ('erreurs' in ligne) {
      return { numero: ligne.numero, resultat: 'INVALIDE', erreurs: ligne.erreurs };
    }
    const analysee = chercherDoublon(ligne, existants, lignesNouvelles);
    if (analysee.resultat === 'VALIDE') {
      lignesNouvelles.telephones.set(ligne.client.telephone, ligne.numero);
      const email = ligne.client.emailClient?.toLowerCase();
      if (email !== undefined) {
        lignesNouvelles.emails.set(email, ligne.numero);
      }
    }
    return analysee;
  });
}

/** Réponse de POST /clients/import/analysis : les données lues ne repartent que dans l'aperçu. */
export function versReponseAnalyse(
  fichier: FichierPrepare,
  lignes: readonly LigneAnalysee[],
): ReponseAnalyse {
  return {
    separateur: fichier.separateur,
    enTetes: fichier.enTetes,
    correspondance: fichier.correspondance,
    colonnesIgnorees: fichier.colonnesIgnorees,
    apercu: fichier.apercu,
    lignes: lignes.map(versLigneApi),
    totaux: {
      lignes: lignes.length,
      valides: lignes.filter((ligne) => ligne.resultat === 'VALIDE').length,
      doublons: lignes.filter((ligne) => ligne.resultat === 'DOUBLON').length,
      invalides: lignes.filter((ligne) => ligne.resultat === 'INVALIDE').length,
    },
  };
}

// ---------- Outils ----------

function verifierNombreDeLignes(nombre: number): void {
  if (nombre === 0) {
    throw new BadRequestException(['Le fichier ne contient aucune ligne de données']);
  }
  if (nombre > LIGNES_DE_DONNEES_MAXIMUM) {
    throw new BadRequestException(['Le fichier dépasse 1 000 lignes de données']);
  }
}

function preparerLigne(
  ligne: LigneCsv,
  champsParColonne: readonly (ChampClient | null)[],
): LignePreparee {
  if (ligne.cellules.length !== champsParColonne.length) {
    return {
      numero: ligne.numero,
      erreurs: [
        `La ligne a ${ligne.cellules.length} colonnes au lieu de ${champsParColonne.length}`,
      ],
    };
  }
  const valeurs = lireValeurs(ligne.cellules, champsParColonne);
  const typeRenseigne = valeurs.typeClient !== undefined;
  try {
    const client = lireNouveauClient(versCorpsDeCreation(valeurs));
    return { numero: ligne.numero, client, typeRenseigne };
  } catch (erreur) {
    if (erreur instanceof BadRequestException) {
      return { numero: ligne.numero, erreurs: messagesDe(erreur) };
    }
    throw erreur;
  }
}

/** Cellule vide ou blanche = champ absent ; apostrophe de neutralisation retirée. */
function lireValeurs(
  cellules: readonly string[],
  champsParColonne: readonly (ChampClient | null)[],
): Partial<Record<ChampClient, string>> {
  const valeurs: Partial<Record<ChampClient, string>> = {};
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
function versCorpsDeCreation(
  valeurs: Partial<Record<ChampClient, string>>,
): Record<string, unknown> {
  const typeClient =
    valeurs.typeClient?.toUpperCase() ??
    (valeurs.raisonSociale !== undefined && valeurs.nomClient === undefined
      ? TypeClient.PROFESSIONNEL
      : TypeClient.PARTICULIER);
  return {
    ...choisir(valeurs, CHAMPS_IDENTITE),
    typeClient,
    adresse: choisir(valeurs, CHAMPS_ADRESSE),
  };
}

function choisir(
  valeurs: Partial<Record<ChampClient, string>>,
  champs: readonly ChampClient[],
): Record<string, string> {
  return Object.fromEntries(
    champs.flatMap((champ) => (valeurs[champ] === undefined ? [] : [[champ, valeurs[champ]]])),
  );
}

/** Le motif nomme le champ de la correspondance (codePostal), pas celui du corps imbriqué. */
function messagesDe(erreur: BadRequestException): string[] {
  const { message } = erreur.getResponse() as { message: string | string[] };
  return (Array.isArray(message) ? message : [message]).map((texte) =>
    texte.replace(/^adresse\./, ''),
  );
}

type LigneValide = Extract<LignePreparee, { client: unknown }>;

interface LignesNouvelles {
  telephones: Map<string, number>;
  emails: Map<string, number>;
}

function chercherDoublon(
  ligne: LigneValide,
  existants: readonly ClientExistant[],
  lignesNouvelles: LignesNouvelles,
): LigneAnalysee {
  const { clients, parTelephone, parEmail } = clientsDesignes(ligne, existants);
  const precedentes = lignesDesignees(ligne, lignesNouvelles);
  if (clients.length + precedentes.length > 1) {
    return { numero: ligne.numero, resultat: 'INVALIDE', erreurs: [MOTIF_DEUX_CLIENTS] };
  }
  const [existant] = clients;
  if (existant !== undefined) {
    return {
      numero: ligne.numero,
      resultat: 'DOUBLON',
      clientId: existant.id,
      motif: motifDuDoublon(existant, parTelephone.includes(existant), parEmail.includes(existant)),
      clientArchive: existant.archive,
      client: ligne.client,
      typeRenseigne: ligne.typeRenseigne,
    };
  }
  const [precedente] = precedentes;
  if (precedente !== undefined) {
    const erreurs = [`Doublon de la ligne ${precedente}`];
    return { numero: ligne.numero, resultat: 'INVALIDE', erreurs };
  }
  return { numero: ligne.numero, resultat: 'VALIDE', client: ligne.client };
}

/** Clients existants désignés par le téléphone ou l'e-mail (sans casse) de la ligne. */
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

/** Lignes précédentes du fichier (nouveaux clients) au même téléphone ou au même e-mail. */
function lignesDesignees(ligne: LigneValide, lignesNouvelles: LignesNouvelles): number[] {
  const email = ligne.client.emailClient?.toLowerCase();
  const numeros = [
    lignesNouvelles.telephones.get(ligne.client.telephone),
    email === undefined ? undefined : lignesNouvelles.emails.get(email),
  ];
  return [...new Set(numeros.filter((numero) => numero !== undefined))];
}

function motifDuDoublon(client: ClientExistant, telephone: boolean, email: boolean): string {
  if (client.archive) {
    return MOTIF_CLIENT_ARCHIVE;
  }
  if (telephone && email) {
    return `Même téléphone et même e-mail que le client ${client.id}`;
  }
  return telephone
    ? `Même téléphone que le client ${client.id}`
    : `Même e-mail que le client ${client.id}`;
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
