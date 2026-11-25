import { BadRequestException } from '@nestjs/common';
import { CHAMPS_CLIENT, type ChampClient, type Correspondance } from './import-clients.types.js';

/*
 * Correspondance entre les colonnes du fichier et les champs d'un client (US31,
 * docs/import-export-csv.md section 4.3) : une proposition tirée des en-têtes, que l'utilisateur
 * peut remplacer colonne par colonne.
 */

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

export interface CorrespondanceEtablie {
  correspondance: Correspondance;
  colonnesIgnorees: string[];
  /** Champ de chaque colonne, dans l'ordre du fichier. */
  champsParColonne: (ChampClient | null)[];
}

/** « Tél. », « TELEPHONE » et « télé-phone » deviennent « telephone ». */
export function normaliserEnTete(enTete: string): string {
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
export function etablirCorrespondance(
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
  const premiereColonne = new Map<string, number>();
  const erreurs: string[] = [];
  enTetes.forEach((enTete, rang) => {
    const premiere = premiereColonne.get(enTete);
    if (premiere === undefined) {
      premiereColonne.set(enTete, rang);
    } else {
      erreurs.push(`Les colonnes ${premiere + 1} et ${rang + 1} portent le même en-tête`);
    }
  });
  if (erreurs.length > 0) {
    throw new BadRequestException(erreurs);
  }
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
  const choisis = [...choix.values()].filter((champ) => champ !== null);
  for (const champ of new Set(choisis)) {
    if (choisis.filter((autre) => autre === champ).length > 1) {
      erreurs.push(`Le champ ${champ} est choisi pour plusieurs colonnes`);
    }
  }
  if (erreurs.length > 0) {
    throw new BadRequestException(erreurs);
  }
  return choix;
}

function attribuerLesChamps(
  enTetes: readonly string[],
  choix: Map<string, ChampClient | null>,
): (ChampClient | null)[] {
  const pris = new Set([...choix.values()].filter((champ) => champ !== null));
  return enTetes.map((enTete) => {
    if (choix.has(enTete)) {
      return choix.get(enTete) ?? null;
    }
    const propose = CHAMP_DU_SYNONYME.get(normaliserEnTete(enTete));
    if (propose === undefined || pris.has(propose)) {
      return null;
    }
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
  if (erreurs.length > 0) {
    throw new BadRequestException(erreurs);
  }
}
