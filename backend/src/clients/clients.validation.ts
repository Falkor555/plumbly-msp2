import {
  type Champs,
  lireBooleenDeRequete,
  lireCodePostal,
  lireEmail,
  lireEnumeration,
  lireObjet,
  lirePagination,
  lireRecherche,
  lireTelephone,
  lireTexte,
  lireTri,
  signalerErreurs,
} from '../commun/validation.js';
import { StatutIntervention, TypeClient } from '../generated/prisma/client.ts';
import type {
  FiltresClients,
  FiltresHistorique,
  ModificationClient,
  NouveauClient,
  NouvelleAdresse,
} from './clients.types.js';
import { TRIS_CLIENTS } from './clients.types.js';
import { verifierIdentite } from './regles-clients.js';

/*
 * Validation des données reçues par les routes des clients (contrat d'API, section 6.5).
 * Les longueurs sont celles des colonnes de la base (modèle de données, 2.3).
 */

const CHAMPS_IDENTITE = [
  'typeClient',
  'nomClient',
  'prenomClient',
  'raisonSociale',
  'telephone',
  'emailClient',
] as const;
const CHAMPS_ADRESSE = ['rue', 'complement', 'codePostal', 'ville', 'infosAcces'] as const;
const TYPES_CLIENT = Object.values(TypeClient);
const STATUTS = Object.values(StatutIntervention);

const LONGUEUR_NOM = 100;
const LONGUEUR_RAISON_SOCIALE = 150;
const LONGUEUR_RUE = 255;
const LONGUEUR_COMPLEMENT = 255;
const LONGUEUR_VILLE = 100;
const LONGUEUR_INFOS_ACCES = 500;

/** POST /clients : le nom ou la raison sociale est vérifié selon le type de client. */
export function lireNouveauClient(corps: unknown): NouveauClient {
  const champs = lireObjet(corps, [...CHAMPS_IDENTITE, 'adresse']);
  const erreurs: string[] = [];
  const identite = lireIdentite(champs, erreurs, { creation: true });
  const adresse = lireAdresseImbriquee(champs.adresse, erreurs);
  signalerErreurs(erreurs);
  const client: NouveauClient = {
    typeClient: identite.typeClient as TypeClient,
    nomClient: identite.nomClient ?? null,
    prenomClient: identite.prenomClient ?? null,
    raisonSociale: identite.raisonSociale ?? null,
    telephone: identite.telephone as string,
    emailClient: identite.emailClient ?? null,
    adresse: adresse as NouvelleAdresse,
  };
  verifierIdentite(client);
  return client;
}

/**
 * PATCH /clients/:id : tous les champs sont facultatifs. La règle nom / raison sociale porte
 * sur le client modifié : le service la vérifie une fois le client relu.
 */
export function lireModificationClient(corps: unknown): ModificationClient {
  const champs = lireObjet(corps, CHAMPS_IDENTITE);
  const erreurs: string[] = [];
  const identite = lireIdentite(champs, erreurs, { creation: false });
  signalerErreurs(erreurs);
  return identite;
}

/** GET /clients : clients non archivés triés par nom affiché, par défaut. */
export function lireFiltresClients(requete: Record<string, unknown>): FiltresClients {
  const champs = lireObjet(requete, [
    'page',
    'limit',
    'recherche',
    'typeClient',
    'archives',
    'tri',
  ]);
  const erreurs: string[] = [];
  const filtres: FiltresClients = {
    ...lirePagination(champs, erreurs),
    archives: lireBooleenDeRequete(champs, 'archives', erreurs),
    tri: lireTri(champs, TRIS_CLIENTS, 'nomAffiche', erreurs),
  };
  const recherche = lireRecherche(champs, erreurs);
  const typeClient = lireEnumeration(champs, 'typeClient', TYPES_CLIENT, erreurs, {
    obligatoire: false,
  });
  signalerErreurs(erreurs);
  if (recherche !== undefined) {
    filtres.recherche = recherche;
  }
  if (typeClient !== undefined) {
    filtres.typeClient = typeClient;
  }
  return filtres;
}

/** GET /clients/:id/interventions : statut accepte plusieurs valeurs séparées par des virgules. */
export function lireFiltresHistorique(requete: Record<string, unknown>): FiltresHistorique {
  const champs = lireObjet(requete, ['page', 'limit', 'statut']);
  const erreurs: string[] = [];
  const filtres: FiltresHistorique = lirePagination(champs, erreurs);
  const statuts = lireStatuts(champs.statut, erreurs);
  signalerErreurs(erreurs);
  if (statuts !== undefined) {
    filtres.statuts = statuts;
  }
  return filtres;
}

// ---------- Outils ----------

function lireIdentite(
  champs: Champs,
  erreurs: string[],
  { creation }: { creation: boolean },
): ModificationClient {
  const facultatif = (maximum: number) => ({ obligatoire: false, maximum, effacable: true });
  const identite: ModificationClient = {
    typeClient: lireEnumeration(champs, 'typeClient', TYPES_CLIENT, erreurs, {
      obligatoire: creation,
    }),
    nomClient: lireTexte(champs, 'nomClient', erreurs, facultatif(LONGUEUR_NOM)),
    prenomClient: lireTexte(champs, 'prenomClient', erreurs, facultatif(LONGUEUR_NOM)),
    raisonSociale: lireTexte(champs, 'raisonSociale', erreurs, facultatif(LONGUEUR_RAISON_SOCIALE)),
    telephone: lireTelephone(champs, 'telephone', erreurs, { obligatoire: creation }),
    emailClient: lireEmail(champs, 'emailClient', erreurs, {
      obligatoire: false,
      effacable: true,
    }),
  };
  return sansChampsAbsents(identite);
}

/** L'adresse envoyée avec un nouveau client : ses erreurs sont préfixées par « adresse. ». */
function lireAdresseImbriquee(valeur: unknown, erreurs: string[]): NouvelleAdresse | undefined {
  if (valeur === undefined || valeur === null) {
    erreurs.push('adresse est obligatoire');
    return undefined;
  }
  if (typeof valeur !== 'object' || Array.isArray(valeur)) {
    erreurs.push('adresse doit être un objet');
    return undefined;
  }
  const champs = valeur as Champs;
  const inconnus = Object.keys(champs)
    .filter((cle) => !(CHAMPS_ADRESSE as readonly string[]).includes(cle))
    .map((cle) => `Le champ adresse.${cle} n’est pas autorisé`);
  const erreursDesChamps: string[] = [];
  const adresse = lireChampsAdresse(champs, erreursDesChamps, { creation: true });
  erreurs.push(...inconnus, ...erreursDesChamps.map((message) => `adresse.${message}`));
  return inconnus.length + erreursDesChamps.length > 0 ? undefined : (adresse as NouvelleAdresse);
}

export function lireChampsAdresse(
  champs: Champs,
  erreurs: string[],
  { creation }: { creation: boolean },
): Partial<NouvelleAdresse> {
  const facultatif = (maximum: number) => ({ obligatoire: false, maximum, effacable: true });
  const obligatoire = (maximum: number) => ({ obligatoire: creation, maximum });
  const adresse: Partial<NouvelleAdresse> = {
    rue: lireTexte(champs, 'rue', erreurs, obligatoire(LONGUEUR_RUE)) ?? undefined,
    complement: lireTexte(champs, 'complement', erreurs, facultatif(LONGUEUR_COMPLEMENT)),
    codePostal: lireCodePostal(champs, 'codePostal', erreurs, { obligatoire: creation }),
    ville: lireTexte(champs, 'ville', erreurs, obligatoire(LONGUEUR_VILLE)) ?? undefined,
    infosAcces: lireTexte(champs, 'infosAcces', erreurs, facultatif(LONGUEUR_INFOS_ACCES)),
  };
  if (creation) {
    adresse.complement ??= null;
    adresse.infosAcces ??= null;
  }
  return sansChampsAbsents(adresse);
}

function lireStatuts(valeur: unknown, erreurs: string[]): StatutIntervention[] | undefined {
  if (valeur === undefined) {
    return undefined;
  }
  const statuts = typeof valeur === 'string' ? valeur.split(',') : [];
  if (statuts.length === 0 || !statuts.every((statut) => STATUTS.includes(statut as never))) {
    erreurs.push(`statut doit contenir un ou plusieurs statuts parmi ${STATUTS.join(', ')}`);
    return undefined;
  }
  return [...new Set(statuts as StatutIntervention[])];
}

/** Retire les clés non envoyées : la mise à jour ne touche que les champs présents. */
function sansChampsAbsents<T extends object>(objet: T): T {
  return Object.fromEntries(
    Object.entries(objet).filter(([, valeur]) => valeur !== undefined),
  ) as T;
}
