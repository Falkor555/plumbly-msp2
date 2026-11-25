import { depuisColonneDate } from '../commun/fuseau-metier.js';
import { versInterventionApi } from '../interventions/interventions.presentation.js';
import type {
  TechnicienAvecNom,
  TechnicienDuPlanning,
  TourneeDetaillee,
} from './tournees.repository.js';
import type { PlanningApi, TechnicienResume, TourneeApi } from './tournees.types.js';

/*
 * Mise en forme des réponses selon le contrat d'API : seuls les champs prévus sortent de l'API,
 * jamais une ligne Prisma telle quelle.
 */

export function versTourneeApi(tournee: TourneeDetaillee, maintenant: Date): TourneeApi {
  return {
    id: tournee.id,
    dateTournee: depuisColonneDate(tournee.dateTournee),
    technicien: versTechnicienResume(tournee.technicien),
    interventions: tournee.interventions.map((intervention) =>
      versInterventionApi(intervention, maintenant),
    ),
  };
}

export function versPlanningApi(
  periode: { du: string; au: string },
  techniciens: TechnicienDuPlanning[],
  maintenant: Date,
): PlanningApi {
  return {
    ...periode,
    techniciens: techniciens.map((technicien) => ({
      ...versTechnicienResume(technicien),
      indisponibilites: technicien.indisponibilites.map(({ id, debut, fin, motif }) => ({
        id,
        debut,
        fin,
        motif,
      })),
      tournees: technicien.tournees.map((tournee) => ({
        id: tournee.id,
        dateTournee: depuisColonneDate(tournee.dateTournee),
        interventions: tournee.interventions.map((intervention) =>
          versInterventionApi(intervention, maintenant),
        ),
      })),
    })),
  };
}

function versTechnicienResume(technicien: TechnicienAvecNom): TechnicienResume {
  return {
    id: technicien.id,
    nom: technicien.utilisateur.nom,
    prenom: technicien.utilisateur.prenom,
    telephone: technicien.telephone,
    couleurPlanning: technicien.couleurPlanning,
  };
}
