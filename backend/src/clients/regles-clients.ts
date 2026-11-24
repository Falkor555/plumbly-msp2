import { BadRequestException } from '@nestjs/common';
import { StatutIntervention, TypeClient } from '../generated/prisma/client.ts';
import type { IdentiteClient } from './clients.types.js';

/*
 * Règles de gestion des clients (cahier des charges, section 5.4), sans base de données :
 * le service leur passe ce qu'il a lu, elles décident.
 */

/** Interventions qui empêchent d'archiver un client ou une adresse (contrat, 6.5). */
export const STATUTS_ACTIFS: StatutIntervention[] = [
  StatutIntervention.A_PLANIFIER,
  StatutIntervention.PLANIFIEE,
  StatutIntervention.EN_COURS,
];

/** Un particulier a un nom, un professionnel une raison sociale (contrainte CHECK de la base). */
export function verifierIdentite(
  client: Pick<IdentiteClient, 'typeClient' | 'nomClient' | 'raisonSociale'>,
): void {
  if (client.typeClient === TypeClient.PARTICULIER && client.nomClient === null) {
    throw new BadRequestException(['nomClient est obligatoire pour un particulier']);
  }
  if (client.typeClient === TypeClient.PROFESSIONNEL && client.raisonSociale === null) {
    throw new BadRequestException(['raisonSociale est obligatoire pour un professionnel']);
  }
}
