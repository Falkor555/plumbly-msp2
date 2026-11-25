import type { Prisma } from '../generated/prisma/client.ts';

/*
 * Forme d'une intervention lue avec ses éléments liés, telle que versInterventionApi l'attend.
 * Partagée par les modules qui renvoient des interventions : interventions, tournées, clients.
 */

// select plutôt qu'include sur utilisateur : le hash du mot de passe ne quitte jamais la base.
const TECHNICIEN_AVEC_NOM = {
  include: { utilisateur: { select: { nom: true, prenom: true } } },
} as const satisfies Prisma.TechnicienDefaultArgs;

export const INTERVENTION_DETAILLEE = {
  include: {
    typeIntervention: true,
    adresse: { include: { client: true } },
    createur: { select: { id: true, nom: true, prenom: true } },
    tournee: { include: { technicien: TECHNICIEN_AVEC_NOM } },
    // US33 : résumé seulement. L'image (jusqu'à 48 Ko) n'est lue que par GET …/signature :
    // cette forme sert aussi aux listes, aux tournées et au planning.
    signature: { select: { nomSignataire: true, signeeLe: true } },
  },
} as const satisfies Prisma.InterventionDefaultArgs;

export type InterventionDetaillee = Prisma.InterventionGetPayload<typeof INTERVENTION_DETAILLEE>;
