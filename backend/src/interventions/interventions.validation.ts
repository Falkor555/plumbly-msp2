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
  type FiltresInterventions,
  type ModificationIntervention,
  type NouvelleIntervention,
  TRIS_INTERVENTIONS,
} from './interventions.types.js';

/*
 * Validation des données reçues par les routes des interventions (contrat d'API, section 6.3).
 * Les longueurs sont celles des colonnes de la base (modèle de données, 2.2).
 */

const LONGUEUR_DESCRIPTION = 1000;
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
