/*
 * Types de transport (JSON) échangés avec l'API, alignés sur backend/src/tournees/tournees.types.ts
 * et sur le contrat d'API (docs/api.md, sections 4, 6.3 et 6.7). Les dates arrivent en chaînes
 * ISO 8601 (instants en UTC) et les jours de tournée au format AAAA-MM-JJ.
 */

export type Urgence = 'NORMALE' | 'PRIORITAIRE' | 'URGENTE';
export type StatutIntervention = 'A_PLANIFIER' | 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';
export type TypeClient = 'PARTICULIER' | 'PROFESSIONNEL';

/** Instant ISO 8601, par exemple « 2026-11-24T04:30:00.000Z ». */
export type DateHeureIso = string;
/** Jour au format « AAAA-MM-JJ ». */
export type DateIso = string;

/** Liste paginée (contrat d'API, section 4). */
export interface ListePaginee<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface PersonneResume {
  id: number;
  nom: string;
  prenom: string;
}

export interface Intervention {
  id: number;
  description: string;
  urgence: Urgence;
  statut: StatutIntervention;
  dureeEstimeeMin: number;
  debutPrevu: DateHeureIso | null;
  finPrevue: DateHeureIso | null;
  enRetard: boolean;
  ordreTournee: number | null;
  compteRendu: string | null;
  motifAnnulation: string | null;
  demarreeLe: DateHeureIso | null;
  termineeLe: DateHeureIso | null;
  annuleeLe: DateHeureIso | null;
  creeLe: DateHeureIso;
  majLe: DateHeureIso;
  type: { id: number; libelle: string };
  adresse: {
    id: number;
    rue: string;
    complement: string | null;
    codePostal: string;
    ville: string;
    infosAcces: string | null;
  };
  client: { id: number; typeClient: TypeClient; nomAffiche: string; telephone: string };
  tournee: { id: number; dateTournee: DateIso; technicien: PersonneResume } | null;
  createur: PersonneResume;
  /** null tant que le client n'a pas signé ; l'image se lit avec GET /interventions/:id/signature. */
  signature: ResumeSignature | null;
}

/** Résumé de la signature du client dans l'objet Intervention (US33), sans l'image. */
export interface ResumeSignature {
  nomSignataire: string;
  signeeLe: DateHeureIso;
}

/** GET /interventions/:id/signature (US33). */
export interface SignatureIntervention extends ResumeSignature {
  /** Compte qui a enregistré la signature (le technicien), et non sa fiche technicien. */
  auteur: PersonneResume;
  empreinte: string;
  /** Faux si le contenu signé (dont le compte rendu) a changé depuis la signature (RG34). */
  integre: boolean;
  /** « data:image/png;base64,… » */
  image: string;
}

/**
 * Corps de POST /interventions/:id/complete. Avec une signature, le compte rendu est obligatoire
 * (RG31) ; sans, il est facultatif.
 */
export interface FinDIntervention {
  compteRendu?: string;
  signature?: { image: string; nomSignataire: string };
}

export interface TechnicienResume extends PersonneResume {
  telephone: string;
  couleurPlanning: string;
}

export interface Tournee {
  id: number;
  dateTournee: DateIso;
  technicien: TechnicienResume;
  /** Triées par ordreTournee. */
  interventions: Intervention[];
}

export interface Indisponibilite {
  id: number;
  debut: DateHeureIso;
  fin: DateHeureIso;
  motif: string | null;
}

export interface TechnicienDuPlanning extends TechnicienResume {
  indisponibilites: Indisponibilite[];
  tournees: Omit<Tournee, 'technicien'>[];
}

/** GET /tours : tous les techniciens actifs, y compris ceux sans tournée (créneaux libres). */
export interface Planning {
  du: DateIso;
  au: DateIso;
  techniciens: TechnicienDuPlanning[];
}

export interface FiltresPlanning {
  du: DateIso;
  au: DateIso;
  technicienId?: number;
}

export interface NouvelleTournee {
  technicienId: number;
  dateTournee: DateIso;
}

export interface Affectation {
  interventionId: number;
  debutPrevu: DateHeureIso;
  /** Rang voulu ; à défaut, l'intervention passe en dernier. */
  ordreTournee?: number;
}

/**
 * Page demandée ; l'API refuse limit au-delà de 100 (400), parametresDePagination la plafonne
 * côté front (docs/api.md, section 4).
 */
export interface Pagination {
  page?: number;
  limit?: number;
}

// ---------- Clients (docs/api.md, section 6.5 ; backend/src/clients/clients.types.ts) ----------

/**
 * Adresse d'intervention d'un client (docs/api.md, 6.5), telle que le choix du client d'une
 * intervention (US14) la lit : sans la date d'archivage.
 */
export interface AdresseClient {
  id: number;
  rue: string;
  complement: string | null;
  codePostal: string;
  ville: string;
  infosAcces: string | null;
  archive: boolean;
}

/** Adresse complète renvoyée par l'API. */
export interface Adresse extends AdresseClient {
  archiveLe: DateHeureIso | null;
}

export interface Client {
  id: number;
  typeClient: TypeClient;
  nomClient: string | null;
  prenomClient: string | null;
  raisonSociale: string | null;
  /** Raison sociale d'un professionnel, « prénom nom » d'un particulier. */
  nomAffiche: string;
  telephone: string;
  emailClient: string | null;
  archive: boolean;
  archiveLe: DateHeureIso | null;
  creeLe: DateHeureIso;
  majLe: DateHeureIso;
  /** Toutes les adresses, archivées comprises, sauf dans la liste qui ne garde que les actives. */
  adresses: Adresse[];
}

/** L'API refuse une chaîne vide : un champ facultatif non rempli est omis. */
export interface NouvelleAdresse {
  rue: string;
  complement?: string;
  codePostal: string;
  ville: string;
  infosAcces?: string;
}

/** Seuls les champs présents changent ; null efface un champ facultatif. */
export interface ModificationAdresse {
  rue?: string;
  complement?: string | null;
  codePostal?: string;
  ville?: string;
  infosAcces?: string | null;
}

/** POST /clients (US06) : le client et sa première adresse (RG21). */
export interface NouveauClient {
  typeClient: TypeClient;
  nomClient?: string;
  prenomClient?: string;
  raisonSociale?: string;
  telephone: string;
  emailClient?: string;
  adresse: NouvelleAdresse;
}

/** PATCH /clients/:id (US10) : seuls les champs présents changent ; null efface. */
export interface ModificationClient {
  typeClient?: TypeClient;
  nomClient?: string | null;
  prenomClient?: string | null;
  raisonSociale?: string | null;
  telephone?: string;
  emailClient?: string | null;
}

export type TriClients = 'nomAffiche' | '-nomAffiche' | 'creeLe' | '-creeLe';

/** Filtres et tri communs à la liste des clients (US08) et à son export (US32). */
export interface CriteresClients {
  recherche?: string;
  typeClient?: TypeClient;
  /** Vrai : les clients archivés sont listés avec les autres. */
  archives?: boolean;
  tri?: TriClients;
}

export interface FiltresClients extends CriteresClients, Pagination {}

/** GET /clients/:id/interventions (US09) : le tri est fixé par l'API (création décroissante). */
export interface FiltresHistorique extends Pagination {
  statuts?: StatutIntervention[];
}

// ---------- Import des clients (US31, backend/src/clients/import/import-clients.types.ts) ----------

export type ChampClient =
  | 'typeClient'
  | 'nomClient'
  | 'prenomClient'
  | 'raisonSociale'
  | 'telephone'
  | 'emailClient'
  | 'rue'
  | 'complement'
  | 'codePostal'
  | 'ville'
  | 'infosAcces';

/** En-tête du fichier → champ client ; null ignore la colonne. */
export type Correspondance = Record<string, ChampClient | null>;

export type SeparateurCsv = ';' | ',';

export type StrategieDoublons = 'IGNORER' | 'METTRE_A_JOUR';

/** POST /clients/import/analysis : rien n'est enregistré. */
export interface DemandeAnalyse {
  contenu: string;
  separateur?: SeparateurCsv;
  correspondance?: Correspondance;
}

/** POST /clients/import : la stratégie des doublons est un choix explicite (RG28). */
export interface DemandeImport extends DemandeAnalyse {
  strategieDoublons: StrategieDoublons;
}

/** Ligne du fichier telle que lue ; l'en-tête est la ligne 1. */
export interface LigneCsv {
  numero: number;
  cellules: string[];
}

export type LigneAnalysee =
  | { numero: number; resultat: 'VALIDE' }
  | { numero: number; resultat: 'DOUBLON'; clientId: number; motif: string }
  | { numero: number; resultat: 'INVALIDE'; erreurs: string[] };

export interface ReponseAnalyse {
  separateur: SeparateurCsv;
  enTetes: string[];
  /** Contient tous les en-têtes du fichier. */
  correspondance: Correspondance;
  colonnesIgnorees: string[];
  apercu: LigneCsv[];
  lignes: LigneAnalysee[];
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

// ---------- Techniciens (docs/api.md, section 6.6 ; backend/src/techniciens/techniciens.types.ts) ----------

/** Fiche complète renvoyée par /technicians ; nom, prénom et e-mail viennent du compte utilisateur. */
export interface FicheTechnicien extends TechnicienResume {
  utilisateurId: number;
  email: string;
  compteActif: boolean;
  archive: boolean;
  archiveLe: DateHeureIso | null;
}

/** POST /technicians (US11) : sans couleur, l'API en choisit une libre dans sa palette. */
export interface NouveauTechnicien {
  utilisateurId: number;
  telephone: string;
  couleurPlanning?: string;
}

/** PATCH /technicians/:id : ni l'un ni l'autre ne s'efface. */
export interface ModificationTechnicien {
  telephone?: string;
  couleurPlanning?: string;
}

export type TriTechniciens = 'nom' | '-nom';

export interface FiltresTechniciens extends Pagination {
  recherche?: string;
  archives?: boolean;
  tri?: TriTechniciens;
}

/** Sans borne, l'API ne renvoie que les indisponibilités en cours ou à venir. */
export interface PeriodeIndisponibilites {
  du?: DateIso;
  au?: DateIso;
}

/** POST /technicians/:id/unavailabilities (US12) : instants avec fuseau (versInstant). */
export interface NouvelleIndisponibilite {
  debut: DateHeureIso;
  fin: DateHeureIso;
  motif?: string;
}

// ---------- Interventions du bureau (#18, docs/api.md, sections 6.3 et 6.4) ----------

/** GET /intervention-types (docs/api.md, 6.4). */
export interface TypeIntervention {
  id: number;
  libelle: string;
  dureeDefautMin: number;
}

/** Corps de POST /interventions (US14) : le client est déduit de l'adresse. */
export interface NouvelleIntervention {
  adresseId: number;
  typeInterventionId: number;
  description: string;
  urgence: Urgence;
  dureeEstimeeMin: number;
}

/** Corps de PATCH /interventions/:id (US16) : seuls les champs changés sont envoyés. */
export type ModificationIntervention = Partial<Omit<NouvelleIntervention, 'adresseId'>>;
