import { techniciensApi } from '../api/techniciens.api';
import { lireToutesLesPages } from '../api/toutesLesPages';
import { type CompteUtilisateur, utilisateursApi } from '../api/utilisateurs.api';

/**
 * US11 : comptes de rôle TECHNICIEN, actifs, qui n'ont pas encore de fiche, triés par nom. Les
 * fiches archivées comptent aussi : l'API refuse une seconde fiche pour le même compte, archivée
 * ou non (409, D02, TechniciensRepository.trouverCompte). GET /users est réservé à
 * l'administrateur : un gestionnaire recevrait 403.
 */
export async function lireComptesSansFiche(signal: AbortSignal): Promise<CompteUtilisateur[]> {
  const [comptes, fiches] = await Promise.all([
    lireToutesLesPages((page, limit) =>
      utilisateursApi.lister({ role: 'TECHNICIEN', actif: true, tri: 'nom', page, limit }, signal),
    ),
    lireToutesLesPages((page, limit) =>
      techniciensApi.lister({ archives: true, page, limit }, signal),
    ),
  ]);
  const comptesAvecFiche = new Set(fiches.map((fiche) => fiche.utilisateurId));
  return comptes.filter((compte) => !comptesAvecFiche.has(compte.id));
}
