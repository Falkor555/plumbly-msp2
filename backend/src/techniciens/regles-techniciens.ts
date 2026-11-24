/*
 * Règles de gestion des techniciens (contrat d'API, section 6.6), sans base de données :
 * le service leur passe ce qu'il a lu, elles décident.
 */

/**
 * Couleurs du planning, assez distinctes pour se reconnaître côte à côte. La première est la
 * sarcelle de la charte graphique.
 */
export const PALETTE_PLANNING = [
  '#0F766E',
  '#1E88E5',
  '#AF4C00',
  '#7B1FA2',
  '#2E7D32',
  '#C62828',
  '#00838F',
  '#5D4037',
  '#AD1457',
  '#455A64',
] as const;

/**
 * Première couleur de la palette qu'aucun technicien en service n'utilise ; si toutes sont
 * prises, la moins utilisée (la première de la palette en cas d'égalité).
 */
export function choisirCouleur(couleursUtilisees: string[]): string {
  const utilisations = new Map<string, number>(PALETTE_PLANNING.map((couleur) => [couleur, 0]));
  for (const couleur of couleursUtilisees) {
    const nombre = utilisations.get(couleur.toUpperCase());
    if (nombre !== undefined) {
      utilisations.set(couleur.toUpperCase(), nombre + 1);
    }
  }
  let choisie: string = PALETTE_PLANNING[0];
  for (const couleur of PALETTE_PLANNING) {
    if ((utilisations.get(couleur) ?? 0) < (utilisations.get(choisie) ?? 0)) {
      choisie = couleur;
    }
  }
  return choisie;
}
