import { BadRequestException } from '@nestjs/common';
import { estUneDate, validerPeriode } from '../commun/validation.js';
import type {
  Affectation,
  FiltresPlanning,
  NouvelleTournee,
  NouvelOrdre,
} from './tournees.types.js';

/*
 * Validation des données reçues par les routes des tournées, écrite à la main en attendant
 * le ValidationPipe et class-validator prévus par le contrat d'API (section 6) : mêmes règles,
 * même format d'erreur (400, message = liste des champs en erreur), champs inconnus refusés.
 */

const IDENTIFIANT_MAXIMUM = 2_147_483_647;
// Une journée de 7 h à 19 h ne contient pas plus d'interventions que cela.
const INTERVENTIONS_PAR_TOURNEE_MAXIMUM = 100;
const JOURS_DE_PLANNING_MAXIMUM = 31;
const FORMAT_DATE_HEURE =
  /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

type Corps = Record<string, unknown>;

export function lireNouvelleTournee(corps: unknown): NouvelleTournee {
  const champs = lireObjet(corps, ['technicienId', 'dateTournee']);
  const erreurs: string[] = [];
  const technicienId = lireEntier(champs, 'technicienId', erreurs, { obligatoire: true });
  const dateTournee = lireJour(champs, 'dateTournee', erreurs);
  signalerErreurs(erreurs);
  return { technicienId: technicienId as number, dateTournee: dateTournee as string };
}

export function lireAffectation(corps: unknown): Affectation {
  const champs = lireObjet(corps, ['interventionId', 'debutPrevu', 'ordreTournee']);
  const erreurs: string[] = [];
  const interventionId = lireEntier(champs, 'interventionId', erreurs, { obligatoire: true });
  const debutPrevu = lireDateHeure(champs, 'debutPrevu', erreurs);
  const ordreTournee = lireEntier(champs, 'ordreTournee', erreurs, { obligatoire: false });
  signalerErreurs(erreurs);
  const affectation: Affectation = {
    interventionId: interventionId as number,
    debutPrevu: debutPrevu as Date,
  };
  if (ordreTournee !== undefined) {
    affectation.ordreTournee = ordreTournee;
  }
  return affectation;
}

export function lireNouvelOrdre(corps: unknown): NouvelOrdre {
  const champs = lireObjet(corps, ['interventionIds']);
  const liste = champs.interventionIds;
  if (!Array.isArray(liste) || liste.length === 0) {
    throw new BadRequestException(['interventionIds doit être une liste non vide d’identifiants']);
  }
  if (liste.length > INTERVENTIONS_PAR_TOURNEE_MAXIMUM) {
    throw new BadRequestException([
      `interventionIds ne peut pas contenir plus de ${INTERVENTIONS_PAR_TOURNEE_MAXIMUM} identifiants`,
    ]);
  }
  if (!liste.every(estUnIdentifiant)) {
    throw new BadRequestException(['interventionIds ne doit contenir que des entiers positifs']);
  }
  // TI14 : deux interventions au même rang sont refusées avant d'ouvrir la transaction.
  if (new Set(liste).size !== liste.length) {
    throw new BadRequestException(['interventionIds contient deux fois la même intervention']);
  }
  return { interventionIds: liste };
}

/** Paramètres de GET /tours : sans période, la semaine en cours (lundi à samedi) est renvoyée. */
export function lireFiltresPlanning(
  requete: Record<string, unknown>,
  semaineParDefaut: { du: string; au: string },
): FiltresPlanning {
  const champs = lireObjet(requete, ['du', 'au', 'technicienId']);
  const { du, au } = champs;
  if ((du === undefined) !== (au === undefined)) {
    throw new BadRequestException(['du et au vont ensemble : préciser les deux ou aucun']);
  }
  if (
    (du !== undefined && typeof du !== 'string') ||
    (au !== undefined && typeof au !== 'string')
  ) {
    throw new BadRequestException(['du et au doivent être des dates AAAA-MM-JJ']);
  }
  const periode = validerPeriode(du === undefined ? semaineParDefaut : { du, au: au as string });
  if (nombreDeJours(periode.du, periode.au) > JOURS_DE_PLANNING_MAXIMUM) {
    throw new BadRequestException([
      `La période ne peut pas dépasser ${JOURS_DE_PLANNING_MAXIMUM} jours`,
    ]);
  }
  const filtres: FiltresPlanning = { ...periode };
  if (champs.technicienId !== undefined) {
    filtres.technicienId = lireIdentifiantDeRequete(champs.technicienId, 'technicienId');
  }
  return filtres;
}

// ---------- Outils ----------

function lireObjet(valeur: unknown, champsAutorises: string[]): Corps {
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
    throw new BadRequestException(['Le corps de la requête doit être un objet JSON']);
  }
  const inconnus = Object.keys(valeur).filter((cle) => !champsAutorises.includes(cle));
  if (inconnus.length > 0) {
    throw new BadRequestException(inconnus.map((cle) => `Le champ ${cle} n’est pas autorisé`));
  }
  return valeur as Corps;
}

function lireEntier(
  champs: Corps,
  nom: string,
  erreurs: string[],
  { obligatoire }: { obligatoire: boolean },
): number | undefined {
  const valeur = champs[nom];
  if (valeur === undefined && !obligatoire) {
    return undefined;
  }
  if (!estUnIdentifiant(valeur)) {
    erreurs.push(`${nom} doit être un entier positif`);
    return undefined;
  }
  return valeur;
}

function lireJour(champs: Corps, nom: string, erreurs: string[]): string | undefined {
  const valeur = champs[nom];
  if (typeof valeur !== 'string' || !estUneDate(valeur)) {
    erreurs.push(`${nom} doit être une date AAAA-MM-JJ`);
    return undefined;
  }
  return valeur;
}

/**
 * Le fuseau est obligatoire (« Z » ou « +04:00 ») : une heure sans fuseau serait lue à l'heure
 * du serveur, et un même créneau pourrait être enregistré avec plusieurs heures de décalage.
 */
function lireDateHeure(champs: Corps, nom: string, erreurs: string[]): Date | undefined {
  const valeur = champs[nom];
  const morceaux = typeof valeur === 'string' ? FORMAT_DATE_HEURE.exec(valeur) : null;
  const instant = morceaux === null ? Number.NaN : Date.parse(valeur as string);
  // Date.parse accepte le 30 février et le reporte au 2 mars : le jour est vérifié à part.
  if (morceaux === null || Number.isNaN(instant) || !estUneDate(morceaux[1])) {
    erreurs.push(
      `${nom} doit être une date-heure ISO 8601 avec fuseau, par exemple 2026-12-08T08:00:00+04:00`,
    );
    return undefined;
  }
  return new Date(instant);
}

function lireIdentifiantDeRequete(valeur: unknown, nom: string): number {
  if (
    typeof valeur !== 'string' ||
    !/^\d{1,10}$/.test(valeur) ||
    !estUnIdentifiant(Number(valeur))
  ) {
    throw new BadRequestException([`${nom} doit être un entier positif`]);
  }
  return Number(valeur);
}

function estUnIdentifiant(valeur: unknown): valeur is number {
  return (
    Number.isInteger(valeur) && (valeur as number) >= 1 && (valeur as number) <= IDENTIFIANT_MAXIMUM
  );
}

function nombreDeJours(du: string, au: string): number {
  return (Date.parse(au) - Date.parse(du)) / 86_400_000 + 1;
}

function signalerErreurs(erreurs: string[]): void {
  if (erreurs.length > 0) {
    throw new BadRequestException(erreurs);
  }
}
