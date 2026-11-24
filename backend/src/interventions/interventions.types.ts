import type { StatutIntervention, TypeClient, Urgence } from '../generated/prisma/client.ts';

// ---------- Données renvoyées (contrat d'API, section 6.3) ----------

export interface InterventionApi {
  id: number;
  description: string;
  urgence: Urgence;
  statut: StatutIntervention;
  dureeEstimeeMin: number;
  debutPrevu: Date | null;
  finPrevue: Date | null;
  enRetard: boolean;
  ordreTournee: number | null;
  compteRendu: string | null;
  motifAnnulation: string | null;
  demarreeLe: Date | null;
  termineeLe: Date | null;
  annuleeLe: Date | null;
  creeLe: Date;
  majLe: Date;
  type: { id: number; libelle: string };
  adresse: {
    id: number;
    rue: string;
    complement: string | null;
    codePostal: string;
    ville: string;
    infosAcces: string | null;
  };
  client: { id: number; typeClient: TypeClient; nomAffiche: string; telephone: string };
  tournee: {
    id: number;
    dateTournee: string;
    technicien: { id: number; nom: string; prenom: string };
  } | null;
  createur: { id: number; nom: string; prenom: string };
}
