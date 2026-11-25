import { BadRequestException } from '@nestjs/common';
import {
  type Champs,
  estUneDate,
  estUnIdentifiant,
  lireEntier,
  lireEnumeration,
  lireObjet,
  lirePagination,
  lireRecherche,
  lireTexte,
  lireTri,
  signalerErreurs,
} from '../commun/validation.js';
import { StatutIntervention, Urgence } from '../generated/prisma/client.ts';
import { lireDuree } from './duree.js';
import {
  type Annulation,
  type CompteRendu,
  type FiltresInterventions,
  type FinDIntervention,
  type ModificationIntervention,
  type NouvelleIntervention,
  type SignatureRecue,
  TRIS_INTERVENTIONS,
} from './interventions.types.js';
import { type ImagePng, ImagePngRefusee, lireImagePng } from './signature-png.js';

/*
 * Validation des données reçues par les routes des interventions (contrat d'API, section 6.3).
 * Les longueurs sont celles des colonnes de la base (modèle de données, 2.2).
 */

const LONGUEUR_DESCRIPTION = 1000;
const LONGUEUR_MOTIF = 500;
const LONGUEUR_COMPTE_RENDU = 2000;
const LONGUEUR_NOM_SIGNATAIRE = 100;
const CHAMPS_SIGNATURE: readonly string[] = ['image', 'nomSignataire'];
const STATUTS = Object.values(StatutIntervention);
const URGENCES = Object.values(Urgence);

const CHAMPS_INTERVENTION = [
  'adresseId',
  'typeInterventionId',
  'description',
  'urgence',
  'dureeEstimeeMin',
] as const;

const PARAMETRES_DE_LISTE = [
  'page',
  'limit',
  'recherche',
  'statut',
  'urgence',
  'technicienId',
  'clientId',
  'du',
  'au',
  'tri',
] as const;

/** POST /interventions (US14) */
export function lireNouvelleIntervention(corps: unknown): NouvelleIntervention {
  const champs = lireObjet(corps, CHAMPS_INTERVENTION);
  const erreurs: string[] = [];
  const intervention = lireChampsIntervention(champs, erreurs, { obligatoire: true });
  signalerErreurs(erreurs);
  return intervention as NouvelleIntervention;
}

/** PATCH /interventions/:id (US16) : champs facultatifs, au moins un. */
export function lireModificationIntervention(corps: unknown): ModificationIntervention {
  const champs = lireObjet(corps, CHAMPS_INTERVENTION);
  const erreurs: string[] = [];
  const modification = lireChampsIntervention(champs, erreurs, { obligatoire: false });
  signalerErreurs(erreurs);
  if (Object.keys(modification).length === 0) {
    throw new BadRequestException(['Aucun champ à modifier']);
  }
  return modification;
}

/** POST /interventions/:id/cancel : motif obligatoire (RG05), espaces des extrémités retirés. */
export function lireAnnulation(corps: unknown): Annulation {
  const champs = lireObjet(corps, ['motif']);
  const erreurs: string[] = [];
  const motif = lireTexte(champs, 'motif', erreurs, {
    obligatoire: true,
    maximum: LONGUEUR_MOTIF,
  });
  signalerErreurs(erreurs);
  return { motif: motif as string };
}

/** POST /interventions/:id/start : aucun corps attendu. */
export function lireDemarrage(corps: unknown): void {
  lireObjet(corps ?? {}, []);
}

/**
 * POST /interventions/:id/complete : compte rendu facultatif ; le corps peut être absent.
 * Avec une signature (US33), le compte rendu devient obligatoire (RG31).
 */
export function lireFinDIntervention(corps: unknown): FinDIntervention {
  const champs = lireObjet(corps ?? {}, ['compteRendu', 'signature']);
  const erreurs: string[] = [];
  const compteRendu = lireTexte(champs, 'compteRendu', erreurs, {
    obligatoire: estUnObjet(champs.signature),
    maximum: LONGUEUR_COMPTE_RENDU,
  });
  const signature =
    champs.signature === undefined ? undefined : lireSignature(champs.signature, erreurs);
  signalerErreurs(erreurs);
  if (signature !== undefined) {
    return { compteRendu: compteRendu as string, signature };
  }
  return typeof compteRendu === 'string' ? { compteRendu } : {};
}

/** PATCH /interventions/:id/report (US18) : texte obligatoire, qui remplace le précédent. */
export function lireCompteRendu(corps: unknown): CompteRendu {
  const champs = lireObjet(corps, ['compteRendu']);
  const erreurs: string[] = [];
  const compteRendu = lireTexte(champs, 'compteRendu', erreurs, {
    obligatoire: true,
    maximum: LONGUEUR_COMPTE_RENDU,
  });
  signalerErreurs(erreurs);
  return { compteRendu: compteRendu as string };
}

/** GET /interventions (US15) : par défaut, les plus urgentes puis les plus anciennes (RG18). */
export function lireFiltresInterventions(requete: Record<string, unknown>): FiltresInterventions {
  const champs = lireObjet(requete, PARAMETRES_DE_LISTE);
  const erreurs: string[] = [];
  const filtres: FiltresInterventions = {
    ...lirePagination(champs, erreurs),
    tri: lireTri(champs, TRIS_INTERVENTIONS, '-urgence', erreurs),
  };
  const facultatifs: Partial<FiltresInterventions> = {
    recherche: lireRecherche(champs, erreurs),
    statuts: lireStatuts(champs.statut, erreurs),
    urgence: lireUrgence(champs, erreurs, { obligatoire: false }),
    technicienId: lireIdentifiantDeRequete(champs, 'technicienId', erreurs),
    clientId: lireIdentifiantDeRequete(champs, 'clientId', erreurs),
    ...lireJours(champs, erreurs),
  };
  signalerErreurs(erreurs);
  return { ...filtres, ...sansChampsAbsents(facultatifs) };
}

// ---------- Outils ----------

/**
 * Objet signature de POST /complete. lireObjet n'est pas utilisé ici : il lève dès la première
 * erreur, avec un message qui parle du corps de la requête. Les erreurs de la signature sont
 * ajoutées aux autres, préfixées par « signature. », pour être renvoyées dans un seul 400.
 */
function lireSignature(valeur: unknown, erreurs: string[]): SignatureRecue | undefined {
  if (valeur === null) {
    erreurs.push('signature ne peut pas être null');
    return undefined;
  }
  if (!estUnObjet(valeur)) {
    erreurs.push('signature doit être un objet');
    return undefined;
  }
  const inconnus = Object.keys(valeur).filter((cle) => !CHAMPS_SIGNATURE.includes(cle));
  if (inconnus.length > 0) {
    erreurs.push(...inconnus.map((cle) => `Le champ signature.${cle} n’est pas autorisé`));
    return undefined;
  }
  const champs: Champs = {
    'signature.nomSignataire': valeur.nomSignataire,
    'signature.image': valeur.image,
  };
  const nomSignataire = lireTexte(champs, 'signature.nomSignataire', erreurs, {
    obligatoire: true,
    maximum: LONGUEUR_NOM_SIGNATAIRE,
  });
  const image = lireImage(champs['signature.image'], erreurs);
  if (typeof nomSignataire !== 'string' || image === undefined) {
    return undefined;
  }
  return { nomSignataire, image };
}

function lireImage(valeur: unknown, erreurs: string[]): ImagePng | undefined {
  if (valeur === undefined || valeur === null) {
    erreurs.push('signature.image est obligatoire');
    return undefined;
  }
  if (typeof valeur !== 'string') {
    erreurs.push('signature.image doit être un texte');
    return undefined;
  }
  try {
    return lireImagePng(valeur);
  } catch (erreur) {
    if (erreur instanceof ImagePngRefusee) {
      erreurs.push(erreur.message);
      return undefined;
    }
    throw erreur;
  }
}

function estUnObjet(valeur: unknown): valeur is Champs {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

function lireChampsIntervention(
  champs: Champs,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): ModificationIntervention {
  return sansChampsAbsents({
    adresseId: lireEntier(champs, 'adresseId', erreurs, { obligatoire }),
    typeInterventionId: lireEntier(champs, 'typeInterventionId', erreurs, { obligatoire }),
    description:
      lireTexte(champs, 'description', erreurs, {
        obligatoire,
        maximum: LONGUEUR_DESCRIPTION,
      }) ?? undefined,
    urgence: lireUrgence(champs, erreurs, { obligatoire }),
    dureeEstimeeMin: lireDuree(champs, 'dureeEstimeeMin', erreurs, { obligatoire: false }),
  });
}

/** Message du contrat d'API (section 3), avec « ou » seulement avant la dernière valeur. */
function lireUrgence(
  champs: Champs,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): Urgence | undefined {
  const erreursDeLecture: string[] = [];
  const urgence = lireEnumeration(champs, 'urgence', URGENCES, erreursDeLecture, { obligatoire });
  if (erreursDeLecture.length > 0) {
    erreurs.push('urgence doit être NORMALE, PRIORITAIRE ou URGENTE');
  }
  return urgence;
}

/** « A_PLANIFIER,PLANIFIEE » : chaque statut est vérifié, et le message nomme ceux refusés. */
function lireStatuts(valeur: unknown, erreurs: string[]): StatutIntervention[] | undefined {
  if (valeur === undefined) {
    return undefined;
  }
  const statuts = typeof valeur === 'string' ? valeur.split(',') : [];
  const refuses = statuts.filter((statut) => !STATUTS.includes(statut as StatutIntervention));
  if (statuts.length === 0 || refuses.length > 0) {
    const detail = refuses.length > 0 ? ` (refusé : ${refuses.join(', ')})` : '';
    erreurs.push(
      `statut doit contenir un ou plusieurs statuts séparés par des virgules parmi ${STATUTS.join(', ')}${detail}`,
    );
    return undefined;
  }
  return [...new Set(statuts as StatutIntervention[])];
}

function lireIdentifiantDeRequete(
  champs: Champs,
  nom: string,
  erreurs: string[],
): number | undefined {
  const valeur = champs[nom];
  if (valeur === undefined) {
    return undefined;
  }
  // Uniquement des chiffres : Number() seul accepterait « 1e3 » ou « 0x1F ».
  const identifiant =
    typeof valeur === 'string' && /^\d{1,10}$/.test(valeur) ? Number(valeur) : Number.NaN;
  if (!estUnIdentifiant(identifiant)) {
    erreurs.push(`${nom} doit être un entier positif`);
    return undefined;
  }
  return identifiant;
}

/** du et au, ensemble ou seuls : jours AAAA-MM-JJ à La Réunion, du avant au. */
function lireJours(champs: Champs, erreurs: string[]): { du?: string; au?: string } {
  const jours: { du?: string; au?: string } = {};
  for (const nom of ['du', 'au'] as const) {
    const valeur = champs[nom];
    if (valeur === undefined) {
      continue;
    }
    if (typeof valeur !== 'string' || !estUneDate(valeur)) {
      erreurs.push(`${nom} doit être une date AAAA-MM-JJ`);
      continue;
    }
    jours[nom] = valeur;
  }
  // Le format AAAA-MM-JJ se compare correctement dans l'ordre alphabétique.
  if (jours.du !== undefined && jours.au !== undefined && jours.du > jours.au) {
    erreurs.push('du doit précéder au ou lui être égal');
  }
  return jours;
}

/** Retire les clés non envoyées : la mise à jour ne touche que les champs présents. */
function sansChampsAbsents<T extends object>(objet: T): T {
  return Object.fromEntries(
    Object.entries(objet).filter(([, valeur]) => valeur !== undefined),
  ) as T;
}
