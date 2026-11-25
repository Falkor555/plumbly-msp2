import { type Prisma, StatutIntervention } from '../generated/prisma/client.ts';
import type { Creneau, Indisponibilite, InterventionPlanifiee } from './regles-planification.js';

/*
 * Lectures et écritures faites dans la transaction d'une modification de planning, partagées par
 * les tournées (affecter, retirer) et les interventions (annuler, changer la durée).
 *
 * Ordre des verrous, toujours le même pour éviter les interblocages :
 *   technicien → tournée → intervention.
 * Le technicien d'abord, comme l'ajout d'une indisponibilité (techniciens.service.ts) : une
 * modification de planning et une indisponibilité simultanées passent l'une après l'autre.
 *
 * Prisma ne sait pas écrire FOR UPDATE : chaque verrou est posé par une requête paramétrée
 * écrite à la main, et dure jusqu'à la fin de la transaction.
 */

type Transaction = Prisma.TransactionClient;

export interface TourneeVerrouillee {
  id: number;
  dateTournee: Date;
  idTechnicien: number;
}

// Statuts qui occupent un créneau dans l'agenda du technicien (RG09).
const STATUTS_OCCUPANT_UN_CRENEAU = [
  StatutIntervention.PLANIFIEE,
  StatutIntervention.EN_COURS,
  StatutIntervention.TERMINEE,
];

/**
 * Verrouille la ligne du technicien de la tournée et renvoie son identifiant : null si la
 * tournée n'existe pas.
 */
export async function verrouillerTechnicienDeLaTournee(
  tx: Transaction,
  idTournee: number,
): Promise<number | null> {
  // Le technicien d'une tournée ne change jamais : le lire sans verrou est sans risque.
  const tournee = await tx.tournee.findUnique({
    where: { id: idTournee },
    select: { idTechnicien: true },
  });
  if (tournee === null) {
    return null;
  }
  await tx.$queryRaw`
    SELECT 1 FROM technicien WHERE id_technicien = ${tournee.idTechnicien} FOR UPDATE`;
  return tournee.idTechnicien;
}

/** Verrouille la ligne de la tournée : null si elle n'existe pas. */
export async function verrouillerTournee(
  tx: Transaction,
  idTournee: number,
): Promise<TourneeVerrouillee | null> {
  const verrou = await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM tournee WHERE id_tournee = ${idTournee} FOR UPDATE`;
  if (verrou.length === 0) {
    return null;
  }
  return tx.tournee.findUniqueOrThrow({
    where: { id: idTournee },
    select: { id: true, dateTournee: true, idTechnicien: true },
  });
}

/**
 * Verrouille la ligne de l'intervention : faux si elle n'existe pas. Chaque module lit ensuite
 * les champs dont il a besoin, sur la ligne verrouillée.
 */
export async function verrouillerLigneIntervention(
  tx: Transaction,
  idIntervention: number,
): Promise<boolean> {
  const verrou = await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM intervention WHERE id_intervention = ${idIntervention} FOR UPDATE`;
  return verrou.length > 0;
}

/** Interventions du technicien qui occupent un créneau recouvrant celui-ci (RG09). */
export async function listerInterventionsDuTechnicien(
  tx: Transaction,
  idTechnicien: number,
  { debut, fin }: Creneau,
  idInterventionExclue: number,
): Promise<InterventionPlanifiee[]> {
  const interventions = await tx.intervention.findMany({
    where: {
      id: { not: idInterventionExclue },
      statut: { in: STATUTS_OCCUPANT_UN_CRENEAU },
      tournee: { idTechnicien },
      debutPrevu: { lt: fin },
      finPrevue: { gt: debut },
    },
    select: { id: true, debutPrevu: true, finPrevue: true },
    orderBy: { debutPrevu: 'asc' },
  });
  // Filtrées sur debutPrevu et finPrevue : les deux sont renseignées.
  return interventions.map(({ id, debutPrevu, finPrevue }) => ({
    id,
    debut: debutPrevu as Date,
    fin: finPrevue as Date,
  }));
}

/** Indisponibilités du technicien qui recouvrent le créneau (RG10). */
export function listerIndisponibilites(
  tx: Transaction,
  idTechnicien: number,
  { debut, fin }: Creneau,
): Promise<Indisponibilite[]> {
  return tx.indisponibilite.findMany({
    where: { idTechnicien, debut: { lt: fin }, fin: { gt: debut } },
    select: { debut: true, fin: true, motif: true },
    orderBy: { debut: 'asc' },
  });
}

/** Décale d'un rang les interventions de la tournée à partir de ce rang. */
export async function decalerRangs(
  tx: Transaction,
  idTournee: number,
  aPartirDuRang: number,
  decalage: 1 | -1,
): Promise<void> {
  // La contrainte UNIQUE (tournée, rang) est différée à la fin de la transaction (RG14) :
  // les rangs peuvent se croiser le temps du décalage.
  await tx.intervention.updateMany({
    where: { idTournee, ordreTournee: { gte: aPartirDuRang } },
    data: { ordreTournee: { increment: decalage } },
  });
}
