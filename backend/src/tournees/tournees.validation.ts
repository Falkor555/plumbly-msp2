import { BadRequestException } from '@nestjs/common';
import {
  type Champs,
  estUnIdentifiant,
  estUneDate,
  lireDateHeure,
  lireEntier,
  lireObjet,
  signalerErreurs,
  validerPeriode,
} from '../commun/validation.js';
import type {
  Affectation,
  FiltresPlanning,
  NouvelleTournee,
  NouvelOrdre,
} from './tournees.types.js';

/*
 * Validation des données reçues par les routes des tournées. Les lecteurs communs (objet,
 * entier, date-heure) sont dans commun/validation.ts, partagés avec les clients et les techniciens.
 */

// Une journée de 7 h à 19 h ne contient pas plus d'interventions que cela.
const INTERVENTIONS_PAR_TOURNEE_MAXIMUM = 100;
const JOURS_DE_PLANNING_MAXIMUM = 31;

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

function lireJour(champs: Champs, nom: string, erreurs: string[]): string | undefined {
  const valeur = champs[nom];
  if (typeof valeur !== 'string' || !estUneDate(valeur)) {
    erreurs.push(`${nom} doit être une date AAAA-MM-JJ`);
    return undefined;
  }
  return valeur;
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

function nombreDeJours(du: string, au: string): number {
  return (Date.parse(au) - Date.parse(du)) / 86_400_000 + 1;
}
