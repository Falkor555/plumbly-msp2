import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Adaptateur pg pour Prisma, avec une session PostgreSQL en UTC.
 *
 * L'adaptateur envoie les dates sans fuseau (« 2026-11-24 04:00:00 », composantes UTC) :
 * PostgreSQL les interprète dans le fuseau de la session. Le conteneur tourne en
 * Indian/Reunion, si bien que sans ce réglage chaque date serait décalée de 4 heures.
 */
export function creerAdaptateurPostgres(urlBase: string): PrismaPg {
  return new PrismaPg({ connectionString: urlBase, options: '-c TimeZone=UTC' });
}
