import type {
  Adresse,
  Client,
  ModificationAdresse,
  ModificationClient,
  NouveauClient,
  NouvelleAdresse,
  TypeClient,
} from '../api/types';

/*
 * Saisie des formulaires client et adresse (US06, US07, US10). La validation reprend les règles de
 * l'API (backend/src/clients/clients.validation.ts et commun/validation.ts) pour signaler chaque
 * champ avant l'envoi : c'est un confort, l'API reste seule juge et ses 400 s'affichent tels quels.
 * Les messages nomment le champ tel que l'écran l'affiche et disent comment corriger.
 */

/** Longueurs des colonnes de la base, les mêmes que l'API. */
export const LONGUEURS_CLIENT = {
  nom: 100,
  raisonSociale: 150,
  email: 255,
  // Au-delà, l'API refuse le numéro sans le nettoyer (normaliserTelephone).
  telephoneSaisi: 20,
  rue: 255,
  complement: 255,
  codePostal: 5,
  ville: 100,
  infosAcces: 500,
} as const;

/** Champs du formulaire client, tels que tapés. */
export interface SaisieClient {
  typeClient: TypeClient;
  nomClient: string;
  prenomClient: string;
  raisonSociale: string;
  telephone: string;
  emailClient: string;
}

export type ChampTexteClient = Exclude<keyof SaisieClient, 'typeClient'>;

/** Champs du formulaire d'adresse, tels que tapés. */
export interface SaisieAdresse {
  rue: string;
  complement: string;
  codePostal: string;
  ville: string;
  infosAcces: string;
}

/** Message d'erreur par champ ; un champ absent est valide. */
export type ErreursSaisie<T> = Partial<Record<keyof T, string>>;

type ChampFacultatifClient = 'nomClient' | 'prenomClient' | 'raisonSociale' | 'emailClient';

const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMAT_TELEPHONE = /^0\d{9}$/;
const FORMAT_CODE_POSTAL = /^\d{5}$/;

export const MESSAGES_CLIENT = {
  nomObligatoire: 'Saisissez le nom : il est obligatoire pour un particulier.',
  raisonSocialeObligatoire:
    'Saisissez la raison sociale : elle est obligatoire pour un professionnel.',
  telephoneObligatoire:
    'Saisissez le téléphone : 10 chiffres commençant par 0, par exemple 0692 12 34 56.',
  telephoneInvalide:
    'Le téléphone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés), par exemple 0692 12 34 56.',
  emailInvalide: 'Saisissez une adresse e-mail valide, par exemple nom@exemple.re.',
  rueObligatoire: 'Saisissez la rue : elle est obligatoire.',
  codePostalObligatoire: 'Saisissez le code postal : 5 chiffres, par exemple 97400.',
  codePostalInvalide: 'Le code postal doit contenir 5 chiffres, par exemple 97400.',
  villeObligatoire: 'Saisissez la ville : elle est obligatoire.',
} as const;

/** « Raccourcissez la rue : 255 caractères au plus. » */
export function messageTropLong(designation: string, maximum: number): string {
  return `Raccourcissez ${designation} : ${maximum} caractères au plus.`;
}

/** Numéro à 10 chiffres sans ses espaces ni ses points, ou null s'il n'est pas valide. */
export function normaliserTelephone(saisie: string): string | null {
  if (saisie.length > LONGUEURS_CLIENT.telephoneSaisi) return null;
  const chiffres = saisie.replace(/[ .]/g, '');
  return FORMAT_TELEPHONE.test(chiffres) ? chiffres : null;
}

export function nombreDErreurs<T>(erreurs: ErreursSaisie<T>): number {
  return Object.values(erreurs).filter((message) => message !== undefined).length;
}

/**
 * Champs de texte affichés selon le type : la raison sociale n'existe que pour un professionnel.
 * Un champ masqué n'est ni validé ni envoyé.
 */
export function champsVisibles(typeClient: TypeClient): ChampTexteClient[] {
  const communs: ChampTexteClient[] = ['nomClient', 'prenomClient', 'telephone', 'emailClient'];
  return typeClient === 'PROFESSIONNEL' ? ['raisonSociale', ...communs] : communs;
}

// ---------- Client ----------

export function saisieDuClient(client?: Client): SaisieClient {
  return {
    typeClient: client?.typeClient ?? 'PARTICULIER',
    nomClient: client?.nomClient ?? '',
    prenomClient: client?.prenomClient ?? '',
    raisonSociale: client?.raisonSociale ?? '',
    telephone: client?.telephone ?? '',
    emailClient: client?.emailClient ?? '',
  };
}

export function validerClient(saisie: SaisieClient): ErreursSaisie<SaisieClient> {
  const professionnel = saisie.typeClient === 'PROFESSIONNEL';
  const erreurs: ErreursSaisie<SaisieClient> = {
    nomClient: verifierTexte(saisie.nomClient, LONGUEURS_CLIENT.nom, 'le nom', {
      obligatoire: professionnel ? undefined : MESSAGES_CLIENT.nomObligatoire,
    }),
    prenomClient: verifierTexte(saisie.prenomClient, LONGUEURS_CLIENT.nom, 'le prénom', {}),
    telephone: verifierTelephone(saisie.telephone),
    emailClient: verifierEmail(saisie.emailClient),
  };
  if (professionnel) {
    erreurs.raisonSociale = verifierTexte(
      saisie.raisonSociale,
      LONGUEURS_CLIENT.raisonSociale,
      'la raison sociale',
      { obligatoire: MESSAGES_CLIENT.raisonSocialeObligatoire },
    );
  }
  return sansChampValide(erreurs);
}

/** POST /clients : les champs facultatifs vides sont omis (l'API refuse une chaîne vide). */
export function versNouveauClient(saisie: SaisieClient, adresse: SaisieAdresse): NouveauClient {
  const facultatifs = champsVisibles(saisie.typeClient).filter(estFacultatif);
  return {
    typeClient: saisie.typeClient,
    ...textesRemplis(saisie, facultatifs),
    telephone: telephoneAEnvoyer(saisie.telephone),
    adresse: versNouvelleAdresse(adresse),
  };
}

/**
 * PATCH /clients/:id : seuls les champs changés partent ; un champ facultatif vidé vaut null, qui
 * l'efface. Un objet vide signifie qu'il n'y a rien à enregistrer.
 */
export function versModificationClient(initial: Client, saisie: SaisieClient): ModificationClient {
  const modification: ModificationClient = {};
  if (saisie.typeClient !== initial.typeClient) modification.typeClient = saisie.typeClient;
  for (const champ of champsVisibles(saisie.typeClient).filter(estFacultatif)) {
    const texte = saisie[champ].trim();
    if (texte !== (initial[champ] ?? '')) modification[champ] = texte === '' ? null : texte;
  }
  const telephone = telephoneAEnvoyer(saisie.telephone);
  if (telephone !== initial.telephone) modification.telephone = telephone;
  return modification;
}

// ---------- Adresse ----------

export function saisieDeLAdresse(adresse?: Adresse): SaisieAdresse {
  return {
    rue: adresse?.rue ?? '',
    complement: adresse?.complement ?? '',
    codePostal: adresse?.codePostal ?? '',
    ville: adresse?.ville ?? '',
    infosAcces: adresse?.infosAcces ?? '',
  };
}

export function validerAdresse(saisie: SaisieAdresse): ErreursSaisie<SaisieAdresse> {
  return sansChampValide({
    rue: verifierTexte(saisie.rue, LONGUEURS_CLIENT.rue, 'la rue', {
      obligatoire: MESSAGES_CLIENT.rueObligatoire,
    }),
    complement: verifierTexte(saisie.complement, LONGUEURS_CLIENT.complement, 'le complément', {}),
    codePostal: verifierCodePostal(saisie.codePostal),
    ville: verifierTexte(saisie.ville, LONGUEURS_CLIENT.ville, 'la ville', {
      obligatoire: MESSAGES_CLIENT.villeObligatoire,
    }),
    infosAcces: verifierTexte(
      saisie.infosAcces,
      LONGUEURS_CLIENT.infosAcces,
      'les informations d’accès',
      {},
    ),
  });
}

/** POST d'une adresse : le complément et les informations d'accès vides sont omis. */
export function versNouvelleAdresse(saisie: SaisieAdresse): NouvelleAdresse {
  const adresse: NouvelleAdresse = {
    rue: saisie.rue.trim(),
    codePostal: saisie.codePostal.trim(),
    ville: saisie.ville.trim(),
  };
  const complement = saisie.complement.trim();
  const infosAcces = saisie.infosAcces.trim();
  if (complement !== '') adresse.complement = complement;
  if (infosAcces !== '') adresse.infosAcces = infosAcces;
  return adresse;
}

/** PATCH d'une adresse : seuls les champs changés partent ; un champ facultatif vidé vaut null. */
export function versModificationAdresse(
  initial: Adresse,
  saisie: SaisieAdresse,
): ModificationAdresse {
  const modification: ModificationAdresse = {};
  for (const champ of ['rue', 'codePostal', 'ville'] as const) {
    const texte = saisie[champ].trim();
    if (texte !== initial[champ]) modification[champ] = texte;
  }
  for (const champ of ['complement', 'infosAcces'] as const) {
    const texte = saisie[champ].trim();
    if (texte !== (initial[champ] ?? '')) modification[champ] = texte === '' ? null : texte;
  }
  return modification;
}

// ---------- Outils ----------

/** Vide : erreur si le champ est obligatoire. Rempli : longueur après retrait des espaces. */
function verifierTexte(
  saisie: string,
  maximum: number,
  designation: string,
  { obligatoire }: { obligatoire?: string },
): string | undefined {
  const texte = saisie.trim();
  if (texte === '') return obligatoire;
  return texte.length > maximum ? messageTropLong(designation, maximum) : undefined;
}

function verifierTelephone(saisie: string): string | undefined {
  if (saisie.trim() === '') return MESSAGES_CLIENT.telephoneObligatoire;
  return normaliserTelephone(saisie) === null ? MESSAGES_CLIENT.telephoneInvalide : undefined;
}

function verifierEmail(saisie: string): string | undefined {
  const texte = saisie.trim();
  if (texte === '') return undefined;
  if (texte.length > LONGUEURS_CLIENT.email) {
    return messageTropLong('l’e-mail', LONGUEURS_CLIENT.email);
  }
  return FORMAT_EMAIL.test(texte) ? undefined : MESSAGES_CLIENT.emailInvalide;
}

function verifierCodePostal(saisie: string): string | undefined {
  const texte = saisie.trim();
  if (texte === '') return MESSAGES_CLIENT.codePostalObligatoire;
  return FORMAT_CODE_POSTAL.test(texte) ? undefined : MESSAGES_CLIENT.codePostalInvalide;
}

/** Le numéro sans espaces ni points ; un numéro invalide (déjà signalé) part tel quel. */
function telephoneAEnvoyer(saisie: string): string {
  return normaliserTelephone(saisie) ?? saisie.trim();
}

function estFacultatif(champ: ChampTexteClient): champ is ChampFacultatifClient {
  return champ !== 'telephone';
}

function textesRemplis(
  saisie: SaisieClient,
  champs: ChampFacultatifClient[],
): Partial<Record<ChampFacultatifClient, string>> {
  const remplis: Partial<Record<ChampFacultatifClient, string>> = {};
  for (const champ of champs) {
    const texte = saisie[champ].trim();
    if (texte !== '') remplis[champ] = texte;
  }
  return remplis;
}

function sansChampValide<T>(erreurs: ErreursSaisie<T>): ErreursSaisie<T> {
  const retenues: ErreursSaisie<T> = {};
  for (const champ of Object.keys(erreurs) as (keyof T)[]) {
    if (erreurs[champ] !== undefined) retenues[champ] = erreurs[champ];
  }
  return retenues;
}
