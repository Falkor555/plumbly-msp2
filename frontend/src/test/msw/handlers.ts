import type { AnyHandler } from 'msw';

// Handlers actifs dans tous les tests. Ceux des ressources (clients, techniciens, tournées)
// seront ajoutés avec la couche API front, sur le contrat validé avec le back-end.
// Un test qui a besoin d'une réponse particulière l'ajoute avec serveurApi.use(...).
export const handlersParDefaut: AnyHandler[] = [];
