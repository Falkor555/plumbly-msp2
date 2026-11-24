import { Prisma } from '../generated/prisma/client.ts';

/*
 * Outils des recherches écrites en SQL (clients, techniciens, interventions) : la requête choisit
 * et trie les identifiants, Prisma charge ensuite les lignes complètes.
 */

/**
 * Nom affiché d'un client, comme le calcule l'API (interventions.presentation.ts, nomAffiche),
 * pour la table client sous l'alias « c ». Un seul fragment pour la recherche des clients et
 * celle des interventions : les deux trouvent toujours les mêmes noms.
 */
export const NOM_AFFICHE_CLIENT = Prisma.sql`CASE WHEN c.type_client = 'PROFESSIONNEL'
  THEN coalesce(c.raison_sociale, '')
  ELSE concat_ws(' ', c.prenom_client, c.nom_client) END`;

/** « 100% » cherche le texte « 100% » : les jokers de LIKE saisis sont neutralisés. */
export function echapperMotif(texte: string): string {
  return texte.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

/** findMany({ id: { in } }) ne garantit pas l'ordre : on rétablit celui de la requête SQL. */
export function dansLOrdreDe<T extends { id: number }>(ids: number[], lignes: T[]): T[] {
  const parId = new Map(lignes.map((ligne) => [ligne.id, ligne]));
  return ids.flatMap((id) => {
    const ligne = parId.get(id);
    return ligne === undefined ? [] : [ligne];
  });
}
