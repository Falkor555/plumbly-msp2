/*
 * Outils des recherches écrites en SQL (clients, techniciens) : la requête choisit et trie les
 * identifiants, Prisma charge ensuite les lignes complètes.
 */

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
