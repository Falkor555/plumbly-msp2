import type { Pagination } from '../commun/validation.js';
import type { StatutIntervention, TypeClient } from '../generated/prisma/client.ts';

// ---------- Données reçues, une fois validées ----------

/** Champs d'une adresse (contrat d'API, section 6.5). */
export interface NouvelleAdresse {
  rue: string;
  complement: string | null;
  codePostal: string;
  ville: string;
  infosAcces: string | null;
}

/** Modification d'une adresse : seuls les champs présents changent ; null efface. */
export type ModificationAdresse = Partial<NouvelleAdresse>;

export interface IdentiteClient {
  typeClient: TypeClient;
  nomClient: string | null;
  prenomClient: string | null;
  raisonSociale: string | null;
  telephone: string;
  emailClient: string | null;
}

/** POST /clients (US06) : le client et sa première adresse (RG21). */
export interface NouveauClient extends IdentiteClient {
  adresse: NouvelleAdresse;
}

/** PATCH /clients/:id (US10) : seuls les champs présents changent ; null efface. */
export type ModificationClient = Partial<IdentiteClient>;

export const TRIS_CLIENTS = ['nomAffiche', '-nomAffiche', 'creeLe', '-creeLe'] as const;
export type TriClients = (typeof TRIS_CLIENTS)[number];

/** Filtres et tri de la liste des clients, communs à GET /clients et à son export (US32). */
export interface CriteresClients {
  recherche?: string;
  typeClient?: TypeClient;
  archives: boolean;
  tri: TriClients;
}

/** GET /clients (US08). */
export type FiltresClients = Pagination & CriteresClients;

/** GET /clients/:id/interventions (US09). */
export interface FiltresHistorique extends Pagination {
  statuts?: StatutIntervention[];
}

// ---------- Données renvoyées (contrat d'API, section 6.5) ----------

export interface AdresseApi {
  id: number;
  rue: string;
  complement: string | null;
  codePostal: string;
  ville: string;
  infosAcces: string | null;
  archive: boolean;
  archiveLe: Date | null;
}

export interface ClientApi {
  id: number;
  typeClient: TypeClient;
  nomClient: string | null;
  prenomClient: string | null;
  raisonSociale: string | null;
  nomAffiche: string;
  telephone: string;
  emailClient: string | null;
  archive: boolean;
  archiveLe: Date | null;
  creeLe: Date;
  majLe: Date;
  adresses: AdresseApi[];
}
