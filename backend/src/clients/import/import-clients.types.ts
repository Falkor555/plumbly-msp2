import type { LigneCsv, SeparateurCsv } from '../../commun/csv/lire-csv.js';
import type { NouveauClient } from '../clients.types.js';

/*
 * Types de l'import des clients (US31, docs/api.md section 6.12). Les champs sont ceux du corps
 * de POST /clients : chaque ligne du fichier est validée comme un nouveau client (RG27).
 */

export const CHAMPS_CLIENT = [
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
] as const;
export type ChampClient = (typeof CHAMPS_CLIENT)[number];

/** En-tête du fichier → champ client ; null ignore la colonne. */
export type Correspondance = Record<string, ChampClient | null>;

export const STRATEGIES_DOUBLONS = ['IGNORER', 'METTRE_A_JOUR'] as const;
export type StrategieDoublons = (typeof STRATEGIES_DOUBLONS)[number];

// ---------- Données reçues, une fois validées ----------

/** POST /clients/import/analysis */
export interface DemandeAnalyse {
  contenu: string;
  separateur?: SeparateurCsv;
  correspondance?: Correspondance;
}

/** POST /clients/import : la stratégie des doublons est un choix explicite (RG28). */
export interface DemandeImport extends DemandeAnalyse {
  strategieDoublons: StrategieDoublons;
}

// ---------- Analyse (sans base de données) ----------

/** Ligne lue et validée ; ses doublons ne sont pas encore cherchés. */
export type LignePreparee =
  | { numero: number; erreurs: string[] }
  | {
      numero: number;
      client: NouveauClient;
      /** Faux si le type a été déduit : une mise à jour ne change alors pas le type (RG28). */
      typeRenseigne: boolean;
    };

export interface FichierPrepare {
  separateur: SeparateurCsv;
  enTetes: string[];
  correspondance: Correspondance;
  colonnesIgnorees: string[];
  /** Les premières lignes de données, telles que lues. */
  apercu: LigneCsv[];
  lignes: LignePreparee[];
}

/** Client déjà en base dont le téléphone ou l'e-mail est celui d'une ligne du fichier. */
export interface ClientExistant {
  id: number;
  telephone: string;
  emailClient: string | null;
  archive: boolean;
}

export type LigneAnalysee =
  | { numero: number; resultat: 'VALIDE'; client: NouveauClient }
  | {
      numero: number;
      resultat: 'DOUBLON';
      clientId: number;
      motif: string;
      clientArchive: boolean;
      client: NouveauClient;
      typeRenseigne: boolean;
    }
  | { numero: number; resultat: 'INVALIDE'; erreurs: string[] };

// ---------- Données renvoyées (contrat d'API, section 6.12) ----------

export type LigneAnalyseeApi =
  | { numero: number; resultat: 'VALIDE' }
  | { numero: number; resultat: 'DOUBLON'; clientId: number; motif: string }
  | { numero: number; resultat: 'INVALIDE'; erreurs: string[] };

export interface ReponseAnalyse {
  separateur: SeparateurCsv;
  enTetes: string[];
  correspondance: Correspondance;
  colonnesIgnorees: string[];
  apercu: LigneCsv[];
  lignes: LigneAnalyseeApi[];
  totaux: { lignes: number; valides: number; doublons: number; invalides: number };
}

export type LigneImportee =
  | { numero: number; resultat: 'CREE' | 'MIS_A_JOUR'; clientId: number }
  | { numero: number; resultat: 'IGNORE'; clientId: number; motif: string }
  | { numero: number; resultat: 'REJETE'; erreurs: string[] };

export interface RapportImport {
  totaux: { crees: number; misAJour: number; ignores: number; rejetes: number };
  lignes: LigneImportee[];
}
