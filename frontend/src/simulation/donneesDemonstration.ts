import type {
  DateIso,
  Indisponibilite,
  Intervention,
  SignatureIntervention,
  TechnicienDuPlanning,
  TypeClient,
  Urgence,
} from '../api/types';
import { ajouterJours, versInstant } from '../commun/dates';

/*
 * Données de démonstration : elles servent aux tests et au mode simulé (VITE_API_SIMULEE),
 * jamais à l'application branchée sur l'API. Les jours sont calculés à partir d'un lundi
 * pour que la démonstration tombe toujours sur la semaine affichée.
 */

interface DescriptionIntervention {
  id: number;
  client: string;
  typeClient?: TypeClient;
  type: string;
  ville: string;
  dureeEstimeeMin: number;
  urgence?: Urgence;
}

const MOINS_DE_48_H = '2026-11-20T06:00:00.000Z';

export function fabriquerIntervention(description: DescriptionIntervention): Intervention {
  return {
    id: description.id,
    description: `${description.type} chez ${description.client}`,
    urgence: description.urgence ?? 'NORMALE',
    statut: 'A_PLANIFIER',
    dureeEstimeeMin: description.dureeEstimeeMin,
    debutPrevu: null,
    finPrevue: null,
    enRetard: false,
    ordreTournee: null,
    compteRendu: null,
    motifAnnulation: null,
    demarreeLe: null,
    termineeLe: null,
    annuleeLe: null,
    creeLe: MOINS_DE_48_H,
    majLe: MOINS_DE_48_H,
    type: { id: description.id * 10, libelle: description.type },
    adresse: {
      id: description.id * 100,
      rue: `${description.id} rue des Flamboyants`,
      complement: null,
      codePostal: '97400',
      ville: description.ville,
      infosAcces: null,
    },
    client: {
      id: description.id * 1000,
      typeClient: description.typeClient ?? 'PARTICULIER',
      nomAffiche: description.client,
      telephone: '0692 12 34 56',
    },
    tournee: null,
    createur: { id: 1, nom: 'Payet', prenom: 'Sophie' },
    signature: null,
  };
}

/** Planifie une intervention à une heure donnée (sans contrôle : c'est le rôle de l'API). */
export function planifier(
  intervention: Intervention,
  jour: DateIso,
  heure: string,
  ordreTournee: number,
): Intervention {
  const debut = versInstant(jour, heure);
  const fin = new Date(
    new Date(debut).getTime() + intervention.dureeEstimeeMin * 60_000,
  ).toISOString();
  return { ...intervention, statut: 'PLANIFIEE', debutPrevu: debut, finPrevue: fin, ordreTournee };
}

export interface JeuDeDemonstration {
  techniciens: TechnicienDuPlanning[];
  interventionsAPlanifier: Intervention[];
  /** Signatures du client par identifiant d'intervention (GET /interventions/:id/signature). */
  signatures: Record<number, SignatureIntervention>;
}

export function creerJeuDeDemonstration(lundi: DateIso): JeuDeDemonstration {
  const mardi = ajouterJours(lundi, 1);
  const jeudi = ajouterJours(lundi, 3);

  const fuite = planifier(
    fabriquerIntervention({
      id: 1,
      client: 'Mme Hoarau',
      type: 'Recherche de fuite',
      ville: 'Saint-Denis',
      dureeEstimeeMin: 60,
    }),
    lundi,
    '08:00',
    1,
  );
  const chauffeEau = {
    ...planifier(
      fabriquerIntervention({
        id: 2,
        client: 'Boulangerie Grondin',
        typeClient: 'PROFESSIONNEL',
        type: 'Chauffe-eau',
        ville: 'Sainte-Marie',
        dureeEstimeeMin: 90,
        urgence: 'URGENTE',
      }),
      lundi,
      '10:00',
      2,
    ),
    statut: 'EN_COURS' as const,
  };
  const robinet = planifier(
    fabriquerIntervention({
      id: 3,
      client: 'M. Fontaine',
      type: 'Remplacement de robinet',
      ville: 'Le Port',
      dureeEstimeeMin: 45,
    }),
    mardi,
    '09:00',
    1,
  );

  const congeJeudi: Indisponibilite = {
    id: 1,
    debut: versInstant(jeudi, '07:00'),
    fin: versInstant(jeudi, '19:00'),
    motif: 'Formation',
  };

  return {
    techniciens: [
      {
        id: 1,
        nom: 'Rivière',
        prenom: 'Jean',
        telephone: '0692 11 11 11',
        couleurPlanning: '#0F766E',
        indisponibilites: [],
        tournees: [{ id: 10, dateTournee: lundi, interventions: [fuite, chauffeEau] }],
      },
      {
        id: 2,
        nom: 'Técher',
        prenom: 'Marie',
        telephone: '0692 22 22 22',
        couleurPlanning: '#AF4C00',
        indisponibilites: [congeJeudi],
        tournees: [{ id: 20, dateTournee: mardi, interventions: [robinet] }],
      },
      {
        id: 3,
        nom: 'Lebon',
        prenom: 'Paul',
        telephone: '0692 33 33 33',
        couleurPlanning: '#4F46E5',
        indisponibilites: [],
        tournees: [],
      },
    ],
    interventionsAPlanifier: [
      fabriquerIntervention({
        id: 4,
        client: 'Mme Nativel',
        type: 'Débouchage',
        ville: 'Saint-Paul',
        dureeEstimeeMin: 60,
        urgence: 'PRIORITAIRE',
      }),
      fabriquerIntervention({
        id: 5,
        client: 'Résidence Les Lataniers',
        typeClient: 'PROFESSIONNEL',
        type: 'Recherche de fuite',
        ville: 'Saint-Denis',
        dureeEstimeeMin: 120,
      }),
    ],
    signatures: {},
  };
}
