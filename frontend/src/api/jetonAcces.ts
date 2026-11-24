/*
 * Le jeton d'accès reste en mémoire, jamais dans le localStorage (ADR 0007) : un script injecté
 * ne peut pas le lire durablement. Après un rechargement de page, il est recréé à partir du
 * cookie httpOnly de rafraîchissement (voir restaurerSession dans auth.api.ts).
 */
let jetonAcces: string | null = null;

type EcouteurSessionExpiree = () => void;
const ecouteursSessionExpiree = new Set<EcouteurSessionExpiree>();

export function lireJetonAcces(): string | null {
  return jetonAcces;
}

export function enregistrerJetonAcces(jeton: string): void {
  jetonAcces = jeton;
}

export function effacerJetonAcces(): void {
  jetonAcces = null;
}

/** Abonne l'application (contexte d'authentification) à la fin de session. Renvoie la désinscription. */
export function surSessionExpiree(ecouteur: EcouteurSessionExpiree): () => void {
  ecouteursSessionExpiree.add(ecouteur);
  return () => ecouteursSessionExpiree.delete(ecouteur);
}

export function terminerSession(): void {
  effacerJetonAcces();
  ecouteursSessionExpiree.forEach((ecouteur) => ecouteur());
}
