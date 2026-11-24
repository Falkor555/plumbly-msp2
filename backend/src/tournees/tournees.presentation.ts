import { depuisColonneDate } from '../commun/fuseau-metier.js';
import { StatutIntervention, TypeClient } from '../generated/prisma/client.ts';
import type {
  InterventionDetaillee,
  TechnicienAvecNom,
  TechnicienDuPlanning,
  TourneeDetaillee,
} from './tournees.repository.js';
import type {
  InterventionApi,
  PlanningApi,
  TechnicienResume,
  TourneeApi,
} from './tournees.types.js';

/*
 * Mise en forme des réponses selon le contrat d'API : seuls les champs prévus sortent de l'API,
 * jamais une ligne Prisma telle quelle.
 */

// RG20 : une intervention planifiée non démarrée 15 minutes après son début prévu est en retard.
const TOLERANCE_DE_RETARD_MS = 15 * 60_000;

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

export function versInterventionApi(
  intervention: InterventionDetaillee,
  maintenant: Date,
): InterventionApi {
  const { adresse, tournee } = intervention;
  return {
    id: intervention.id,
    description: intervention.description,
    urgence: intervention.urgence,
    statut: intervention.statut,
    dureeEstimeeMin: intervention.dureeEstimeeMin,
    debutPrevu: intervention.debutPrevu,
    finPrevue: intervention.finPrevue,
    enRetard: estEnRetard(intervention, maintenant),
    ordreTournee: intervention.ordreTournee,
    compteRendu: intervention.compteRendu,
    motifAnnulation: intervention.motifAnnulation,
    demarreeLe: intervention.demarreeLe,
    termineeLe: intervention.termineeLe,
    annuleeLe: intervention.annuleeLe,
    creeLe: intervention.creeLe,
    majLe: intervention.majLe,
    type: { id: intervention.typeIntervention.id, libelle: intervention.typeIntervention.libelle },
    adresse: {
      id: adresse.id,
      rue: adresse.rue,
      complement: adresse.complement,
      codePostal: adresse.codePostal,
      ville: adresse.ville,
      infosAcces: adresse.infosAcces,
    },
    client: {
      id: adresse.client.id,
      typeClient: adresse.client.typeClient,
      nomAffiche: nomAffiche(adresse.client),
      telephone: adresse.client.telephone,
    },
    tournee:
      tournee === null
        ? null
        : {
            id: tournee.id,
            dateTournee: depuisColonneDate(tournee.dateTournee),
            technicien: {
              id: tournee.technicien.id,
              nom: tournee.technicien.utilisateur.nom,
              prenom: tournee.technicien.utilisateur.prenom,
            },
          },
    createur: intervention.createur,
  };
}

export function estEnRetard(
  { statut, debutPrevu }: Pick<InterventionDetaillee, 'statut' | 'debutPrevu'>,
  maintenant: Date,
): boolean {
  return (
    statut === StatutIntervention.PLANIFIEE &&
    debutPrevu !== null &&
    maintenant.getTime() > debutPrevu.getTime() + TOLERANCE_DE_RETARD_MS
  );
}

/** Nom et prénom pour un particulier, raison sociale pour un professionnel (contrat, 6.3). */
function nomAffiche(client: InterventionDetaillee['adresse']['client']): string {
  if (client.typeClient === TypeClient.PROFESSIONNEL) {
    return client.raisonSociale ?? '';
  }
  return [client.prenomClient, client.nomClient].filter((morceau) => morceau !== null).join(' ');
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
