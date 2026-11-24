import type { TechnicienAvecCompte } from './techniciens.repository.js';
import type { TechnicienApi } from './techniciens.types.js';

/*
 * Mise en forme des réponses selon le contrat d'API (section 6.6) : seuls les champs prévus
 * sortent de l'API, jamais une ligne Prisma telle quelle.
 */

export function versTechnicienApi(technicien: TechnicienAvecCompte): TechnicienApi {
  return {
    id: technicien.id,
    utilisateurId: technicien.idUtilisateur,
    nom: technicien.utilisateur.nom,
    prenom: technicien.utilisateur.prenom,
    email: technicien.utilisateur.email,
    compteActif: technicien.utilisateur.actif,
    telephone: technicien.telephone,
    couleurPlanning: technicien.couleurPlanning,
    archive: technicien.archive,
    archiveLe: technicien.archiveLe,
  };
}
