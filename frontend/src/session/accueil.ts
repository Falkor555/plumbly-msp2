import type { Role } from '../api/auth.api';

/** Première page après la connexion, selon le rôle. */
export function accueilDe(role: Role): string {
  return role === 'TECHNICIEN' ? '/ma-tournee' : '/planning';
}
