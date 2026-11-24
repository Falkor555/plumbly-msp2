import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ajouterJours,
  heureMetier,
  jourDeLaSemaine,
  jourMetier,
  minutesDepuisMinuitMetier,
} from '../commun/fuseau-metier.js';
import { StatutIntervention } from '../generated/prisma/client.ts';

/*
 * Règles de gestion de la planification (cahier des charges, section 5.2), sans base de données :
 * le service leur passe ce qu'il a lu, elles décident. Les horaires sont ceux de La Réunion.
 */

const DIMANCHE = 0;
const LUNDI = 1;
const SAMEDI = 6;
const OUVERTURE_EN_MINUTES = 7 * 60;
const FERMETURE_EN_MINUTES = 19 * 60;
const MILLISECONDES_PAR_MINUTE = 60_000;

export interface Creneau {
  debut: Date;
  fin: Date;
}

export interface InterventionPlanifiee extends Creneau {
  id: number;
}

export interface Indisponibilite extends Creneau {
  motif: string | null;
}

export interface RangDansLaTournee {
  id: number;
  statut: StatutIntervention;
  ordreTournee: number;
}

export function creneauDe(debut: Date, dureeMinutes: number): Creneau {
  return { debut, fin: new Date(debut.getTime() + dureeMinutes * MILLISECONDES_PAR_MINUTE) };
}

/** RG09 : deux créneaux se chevauchent si B.debut < A.fin et B.fin > A.debut. */
export function seChevauchent(a: Creneau, b: Creneau): boolean {
  return b.debut < a.fin && b.fin > a.debut;
}

/** Lundi et samedi de la semaine qui contient ce jour (RG11 : on travaille du lundi au samedi). */
export function semaineDe(jour: string): { du: string; au: string } {
  const jourSemaine = jourDeLaSemaine(jour);
  // Le dimanche appartient à la semaine qui s'achève, comme dans la norme ISO 8601.
  const ecartAuLundi = jourSemaine === DIMANCHE ? 6 : jourSemaine - LUNDI;
  const lundi = ajouterJours(jour, -ecartAuLundi);
  return { du: lundi, au: ajouterJours(lundi, SAMEDI - LUNDI) };
}

/** RG11 et RG12 : une tournée est créée pour un jour ouvré, aujourd'hui ou plus tard. */
export function verifierDateDeTournee(dateTournee: string, maintenant: Date): void {
  if (dateTournee < jourMetier(maintenant)) {
    throw new BadRequestException('Impossible de créer une tournée pour une date passée.');
  }
  if (jourDeLaSemaine(dateTournee) === DIMANCHE) {
    throw new BadRequestException('Les tournées ont lieu du lundi au samedi.');
  }
}

/** RG11 : le créneau tient dans la journée de la tournée, entre 7 h et 19 h. */
export function verifierHorairesOuvres(creneau: Creneau, dateTournee: string): void {
  const memeJour =
    jourMetier(creneau.debut) === dateTournee && jourMetier(creneau.fin) === dateTournee;
  if (
    !memeJour ||
    minutesDepuisMinuitMetier(creneau.debut) < OUVERTURE_EN_MINUTES ||
    minutesDepuisMinuitMetier(creneau.fin) > FERMETURE_EN_MINUTES
  ) {
    throw new BadRequestException(
      `Le créneau ${decrire(creneau)} doit se situer le ${dateTournee} entre 07:00 et 19:00.`,
    );
  }
}

/** RG09 : refus avec l'intervention en conflit dans le message (contrat d'API, US21). */
export function verifierAbsenceDeChevauchement(
  creneau: Creneau,
  interventions: InterventionPlanifiee[],
): void {
  const conflit = interventions.find((intervention) => seChevauchent(intervention, creneau));
  if (conflit !== undefined) {
    throw new ConflictException(
      `Le technicien a déjà l’intervention n° ${conflit.id} sur ce créneau (${decrire(conflit)}).`,
    );
  }
}

/** RG10 : on ne planifie pas un technicien pendant une indisponibilité. */
export function verifierDisponibilite(creneau: Creneau, indisponibilites: Indisponibilite[]): void {
  const indisponibilite = indisponibilites.find((periode) => seChevauchent(periode, creneau));
  if (indisponibilite !== undefined) {
    const motif = indisponibilite.motif === null ? '' : ` (${indisponibilite.motif})`;
    throw new ConflictException(
      `Le technicien est indisponible du ${jourMetier(indisponibilite.debut)} ${heureMetier(indisponibilite.debut)} au ${jourMetier(indisponibilite.fin)} ${heureMetier(indisponibilite.fin)}${motif}.`,
    );
  }
}

/** RG02 : seule une intervention « à planifier » peut être affectée à une tournée. */
export function verifierAffectable(statut: StatutIntervention): void {
  if (statut !== StatutIntervention.A_PLANIFIER) {
    throw new BadRequestException(
      `Seule une intervention à planifier peut être affectée (statut actuel : ${statut}).`,
    );
  }
}

/** RG04 et RG15 : seule une intervention planifiée, pas encore démarrée, peut être retirée. */
export function verifierRetirable(statut: StatutIntervention): void {
  if (statut !== StatutIntervention.PLANIFIEE) {
    throw new BadRequestException(
      `Seule une intervention planifiée non démarrée peut être retirée (statut actuel : ${statut}).`,
    );
  }
}

/**
 * Rang d'une nouvelle intervention (RG13) : en dernier par défaut, sinon entre 1 et n + 1.
 * RG15 et RG16 : on n'insère pas devant une intervention démarrée, terminée ou annulée,
 * car cela changerait sa place dans la tournée.
 */
export function rangDInsertion(
  interventions: RangDansLaTournee[],
  rangDemande: number | undefined,
): number {
  const dernierRang = interventions.length + 1;
  const rang = rangDemande ?? dernierRang;
  if (rang > dernierRang) {
    throw new BadRequestException(`ordreTournee doit être compris entre 1 et ${dernierRang}.`);
  }
  const deplacee = interventions.find(
    (intervention) =>
      intervention.ordreTournee >= rang && intervention.statut !== StatutIntervention.PLANIFIEE,
  );
  if (deplacee !== undefined) {
    throw new BadRequestException(
      `Impossible d’insérer avant l’intervention n° ${deplacee.id} (${deplacee.statut}) : sa place ne peut plus changer.`,
    );
  }
  return rang;
}

/**
 * RG13 à RG16 : le nouvel ordre contient exactement les interventions de la tournée, et une
 * intervention qui n'est plus « planifiée » garde son rang. Renvoie les rangs à enregistrer.
 */
export function nouveauxRangs(
  interventions: RangDansLaTournee[],
  idsDansLOrdre: number[],
): Map<number, number> {
  const actuelles = new Map(interventions.map((intervention) => [intervention.id, intervention]));
  const memeContenu =
    idsDansLOrdre.length === interventions.length && idsDansLOrdre.every((id) => actuelles.has(id));
  if (!memeContenu) {
    throw new BadRequestException(
      'Le nouvel ordre doit contenir exactement les interventions de la tournée, une seule fois chacune.',
    );
  }
  const rangs = new Map(idsDansLOrdre.map((id, index) => [id, index + 1]));
  const deplacee = interventions.find(
    (intervention) =>
      intervention.statut !== StatutIntervention.PLANIFIEE &&
      rangs.get(intervention.id) !== intervention.ordreTournee,
  );
  if (deplacee !== undefined) {
    throw new BadRequestException(
      `L’intervention n° ${deplacee.id} (${deplacee.statut}) ne peut plus changer de place.`,
    );
  }
  return rangs;
}

function decrire({ debut, fin }: Creneau): string {
  return `${heureMetier(debut)}–${heureMetier(fin)}`;
}
