import { ErreurApi } from '../api/erreurs';
import type {
  ChampClient,
  Correspondance,
  ReponseAnalyse,
  SeparateurCsv,
  StrategieDoublons,
} from '../api/types';
import { messageErreur } from '../commun/messageErreur';

/*
 * Calculs de l'assistant d'import des clients (US31), sans React : correspondance envoyée,
 * options des menus, libellés et messages. Les règles suivent l'API
 * (backend/src/clients/import/correspondance-colonnes.ts et import-clients.validation.ts).
 */

/** Texte du fichier, lu une fois et renvoyé tel quel à chaque analyse et à l'import. */
export interface FichierLu {
  nom: string;
  contenu: string;
}

export interface ErreurAffichee {
  /** Message de l'API ou du contrôle du navigateur, affiché tel quel. */
  message: string;
  /** Ce que l'utilisateur peut faire pour s'en sortir. */
  aide?: string;
  /** En-tête de la colonne dont le changement a été refusé : son menu porte l'erreur. */
  colonne?: string;
}

/**
 * 1 Mo, compté en octets comme le dit l'écran. L'API compte 1 000 000 caractères : un fichier plus
 * lourd en octets que 1 000 000 peut tenir en caractères (accents), mais le refuser ici garde une
 * règle simple et ne laisse partir aucun fichier que l'API pourrait refuser pour sa longueur.
 */
export const TAILLE_MAX_FICHIER = 1_000_000;

export const MESSAGE_FICHIER_TROP_GROS = 'Le fichier dépasse la taille acceptée (1 Mo).';

/** Message de l'API pour un fichier qui n'est pas en UTF-8, repris pour le contrôle du navigateur. */
export const MESSAGE_ENCODAGE = 'Enregistrez le fichier au format CSV UTF-8';

/** Le navigateur décode en UTF-8 : un octet invalide devient ce caractère de remplacement. */
const CARACTERE_DE_REMPLACEMENT = '�';

/** Champs dans l'ordre des menus : identité, contact, puis adresse. */
export const CHAMPS_CLIENT: readonly ChampClient[] = [
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

export const LIBELLES_CHAMPS: Record<ChampClient, string> = {
  typeClient: 'Type de client',
  nomClient: 'Nom',
  prenomClient: 'Prénom',
  raisonSociale: 'Raison sociale',
  telephone: 'Téléphone',
  emailClient: 'E-mail',
  rue: 'Rue',
  complement: 'Complément d’adresse',
  codePostal: 'Code postal',
  ville: 'Ville',
  infosAcces: 'Informations d’accès',
};

/** Valeur du menu « séparateur » : chaîne vide pour la détection automatique de l'API. */
export type ChoixSeparateur = SeparateurCsv | '';

export const OPTIONS_SEPARATEUR: { valeur: ChoixSeparateur; libelle: string }[] = [
  { valeur: '', libelle: 'Automatique' },
  { valeur: ';', libelle: 'Point-virgule (;)' },
  { valeur: ',', libelle: 'Virgule (,)' },
];

export const LIBELLES_SEPARATEUR: Record<SeparateurCsv, string> = {
  ';': 'point-virgule',
  ',': 'virgule',
};

export const OPTIONS_STRATEGIE: { valeur: StrategieDoublons; libelle: string }[] = [
  { valeur: 'IGNORER', libelle: 'Ignorer les doublons' },
  { valeur: 'METTRE_A_JOUR', libelle: 'Mettre à jour les clients existants' },
];

/** Contrôle de confort avant l'envoi : l'API refait ses propres contrôles. */
export function erreurDeTaille(tailleEnOctets: number): string | null {
  return tailleEnOctets > TAILLE_MAX_FICHIER ? MESSAGE_FICHIER_TROP_GROS : null;
}

export function erreurDEncodage(contenu: string): string | null {
  return contenu.includes(CARACTERE_DE_REMPLACEMENT) ? MESSAGE_ENCODAGE : null;
}

/**
 * Correspondance à envoyer après le choix d'un champ pour une colonne. Seules les colonnes
 * changées par l'utilisateur y figurent : l'API garde sa proposition pour les autres, et retire
 * d'elle-même un champ choisi ailleurs. Si ce champ avait déjà été choisi pour une autre colonne,
 * celle-ci passe à null : l'API refuse un même champ choisi pour deux colonnes (400).
 */
export function choisirChamp(
  choix: Correspondance,
  enTete: string,
  champ: ChampClient | null,
): Correspondance {
  const suivant: Correspondance = {};
  for (const [autre, champDeLAutre] of Object.entries(choix)) {
    suivant[autre] = champ !== null && champDeLAutre === champ ? null : champDeLAutre;
  }
  suivant[enTete] = champ;
  return suivant;
}

/**
 * Champ affiché pour une colonne : le choix de l'utilisateur s'il en a fait un (l'analyse qui en
 * tient compte peut être encore en cours, ou avoir été refusée), sinon celui de l'analyse.
 */
export function champAffiche(
  choix: Correspondance,
  correspondanceAnalysee: Correspondance,
  enTete: string,
): ChampClient | null {
  // hasOwn : un en-tête « constructor » ne doit pas lire la propriété héritée d'Object.
  if (Object.hasOwn(choix, enTete)) return choix[enTete];
  return Object.hasOwn(correspondanceAnalysee, enTete) ? correspondanceAnalysee[enTete] : null;
}

export interface OptionDeChamp {
  valeur: ChampClient;
  libelle: string;
}

/**
 * Options du menu d'une colonne. Un champ déjà pris par une autre colonne le dit : le choisir
 * le retire à celle-ci, ce que l'utilisateur doit savoir avant de choisir.
 */
export function optionsDeChamp(
  champsAffiches: ReadonlyMap<string, ChampClient | null>,
  enTete: string,
): OptionDeChamp[] {
  return CHAMPS_CLIENT.map((champ) => {
    const autre = [...champsAffiches].find(
      ([colonne, champDeLaColonne]) => colonne !== enTete && champDeLaColonne === champ,
    )?.[0];
    const libelle = LIBELLES_CHAMPS[champ];
    return {
      valeur: champ,
      libelle: autre === undefined ? libelle : `${libelle} (pris par ${nomDeColonne(autre)})`,
    };
  });
}

/** L'en-tête entre guillemets, ou « une colonne sans en-tête » : un en-tête vide ne se lirait pas. */
export function nomDeColonne(enTete: string): string {
  return enTete.trim() === '' ? 'une colonne sans en-tête' : `« ${enTete} »`;
}

/** Nom du menu d'une colonne ; sans en-tête, son rang dans le fichier (à partir de 1) la désigne. */
export function libelleDuMenu(enTete: string, rang: number): string {
  return enTete.trim() === ''
    ? `Champ pour la colonne ${rang + 1}, sans en-tête`
    : `Champ pour la colonne « ${enTete} »`;
}

/**
 * Lignes que l'import enregistrera : les valides, plus les doublons si l'utilisateur a choisi de
 * les mettre à jour. Un doublon d'un client archivé reste ignoré : le compte rendu le dira.
 */
export function lignesAEnregistrer(
  totaux: ReponseAnalyse['totaux'],
  strategie: StrategieDoublons,
): number {
  return totaux.valides + (strategie === 'METTRE_A_JOUR' ? totaux.doublons : 0);
}

/** « 1 ligne », « 12 lignes » ; « 0 ligne » comme le veut l'usage français. */
export function nombreDeLignes(nombre: number): string {
  return `${nombre} ligne${nombre > 1 ? 's' : ''}`;
}

/**
 * Un champ obligatoire sans colonne fait échouer toute l'analyse, sans en-têtes ni aperçu : le
 * menu ne peut pas être proposé, il faut renommer la colonne dans le fichier. Le préfixe est
 * celui de verifierChampsObligatoires (correspondance-colonnes.ts).
 */
export function manqueUnChampObligatoire(erreur: unknown): boolean {
  return (
    erreur instanceof ErreurApi &&
    erreur.statut === 400 &&
    erreur.messagesServeur.some((message) => message.startsWith('Aucune colonne pour'))
  );
}

/** 413 : le corps dépasse 1,5 Mo ; l'API n'envoie alors qu'un texte technique. */
function estTropGros(erreur: unknown): boolean {
  return erreur instanceof ErreurApi && erreur.statut === 413;
}

/** Message d'un échec de l'analyse : celui de l'API pour un 400, un texte clair pour un 413. */
export function messageErreurAnalyse(erreur: unknown): string {
  if (estTropGros(erreur)) return MESSAGE_FICHIER_TROP_GROS;
  return messageErreur(erreur, 'Analyse du fichier impossible');
}

/**
 * Message d'un échec de l'import. Le 500 de l'API suit l'annulation de toute la transaction
 * (RG29) : l'utilisateur doit savoir qu'aucun client n'a été enregistré, pour relancer sans
 * crainte. Un autre 5xx vient d'un intermédiaire (proxy, délai dépassé) pendant que l'API peut
 * avoir validé l'import : le résultat est inconnu, et seule la détection des doublons (RG28)
 * rend un nouvel essai sans risque.
 */
export function messageErreurImport(erreur: unknown): string {
  if (estTropGros(erreur)) return MESSAGE_FICHIER_TROP_GROS;
  if (erreur instanceof ErreurApi && erreur.statut === 500) {
    return 'L’import a échoué : aucun client du fichier n’a été enregistré. Réessayez plus tard.';
  }
  if (erreur instanceof ErreurApi && erreur.statut > 500) {
    return 'Le serveur n’a pas confirmé l’import : des clients ont pu être enregistrés. Rechargez la liste avant de réessayer ; les clients déjà présents seront reconnus comme doublons.';
  }
  return messageErreur(erreur, 'Import des clients impossible');
}
