import type { TriTechniciens } from '../api/types';
import type { CompteUtilisateur } from '../api/utilisateurs.api';

/** Tris acceptés par GET /technicians (backend/src/techniciens/techniciens.types.ts). */
export const OPTIONS_TRI_TECHNICIENS: { valeur: TriTechniciens; libelle: string }[] = [
  { valeur: 'nom', libelle: 'Nom, de A à Z' },
  { valeur: '-nom', libelle: 'Nom, de Z à A' },
];

/** « 1 technicien », « 12 techniciens ». */
export function nombreDeTechniciens(nombre: number): string {
  return `${nombre} technicien${nombre > 1 ? 's' : ''}`;
}

/** « KB » pour Karim Benali : posées sur la pastille de sa couleur de planning. */
export function initiales(personne: { prenom: string; nom: string }): string {
  return `${personne.prenom.charAt(0)}${personne.nom.charAt(0)}`.toUpperCase();
}

/** « Karim Benali — karim.benali@plumbly.re » : l'e-mail départage deux homonymes. */
export function libelleDuCompte(
  compte: Pick<CompteUtilisateur, 'prenom' | 'nom' | 'email'>,
): string {
  return `${compte.prenom} ${compte.nom} — ${compte.email}`;
}
