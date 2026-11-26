import type {
  Adresse,
  Client,
  DateIso,
  FicheTechnicien,
  Indisponibilite,
  Intervention,
  SignatureIntervention,
  TechnicienDuPlanning,
  TypeClient,
  Urgence,
} from '../api/types';
import type { CompteUtilisateur } from '../api/utilisateurs.api';
import { ajouterJours, versInstant } from '../commun/dates';
import {
  CLIENT_BOULANGERIE_GRONDIN,
  CLIENT_JEAN_YVES_FONTAINE,
  CLIENT_MARIE_CLAUDE_HOARAU,
  CLIENT_RESIDENCE_LATANIERS,
  CLIENT_ROSEMAY_NATIVEL,
  clientsDeDemonstration,
} from './clientsDemonstration';
import {
  comptesUtilisateursDeDemonstration,
  TECHNICIEN_DEMONSTRATION,
  UTILISATEUR_ID_MARIE_TECHER,
  UTILISATEUR_ID_PAUL_LEBON,
  UTILISATEUR_ID_SEBASTIEN_PAYET,
} from './comptesDemonstration';
import { fabriquerTechnicien } from './fabriques';

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

/** Intervention chez un client fictif réduit à son nom affiché (tests du planning, du terrain). */
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

type DescriptionChezUnClient = Omit<DescriptionIntervention, 'client' | 'typeClient' | 'ville'>;

/** Le client tel qu'une intervention le présente (interventions.presentation.ts du back). */
export function resumeDuClient(client: Client): Intervention['client'] {
  const { id, typeClient, nomAffiche, telephone } = client;
  return { id, typeClient, nomAffiche, telephone };
}

/** L'adresse telle qu'une intervention la présente, sans son état d'archivage. */
export function resumeDeLAdresse(adresse: Adresse): Intervention['adresse'] {
  const { id, rue, complement, codePostal, ville, infosAcces } = adresse;
  return { id, rue, complement, codePostal, ville, infosAcces };
}

/**
 * Intervention rattachée à un client de démonstration et à l'une de ses adresses, comme l'API
 * la renvoie : l'historique du client (US09) et le planning montrent la même personne.
 */
export function fabriquerInterventionChez(
  client: Client,
  adresse: Adresse,
  description: DescriptionChezUnClient,
): Intervention {
  const intervention = fabriquerIntervention({
    ...description,
    client: client.nomAffiche,
    typeClient: client.typeClient,
    ville: adresse.ville,
  });
  return { ...intervention, adresse: resumeDeLAdresse(adresse), client: resumeDuClient(client) };
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

/**
 * Technicien du jeu : sa fiche (GET /technicians, US11) et ce que le planning en montre
 * (GET /tours) ne font qu'un, pour qu'une fiche créée ou archivée se voie aussitôt au planning.
 */
export type TechnicienDeDemonstration = TechnicienDuPlanning & FicheTechnicien;

type DescriptionTechnicienDeDemonstration = Parameters<typeof fabriquerTechnicien>[0] &
  Partial<Pick<TechnicienDuPlanning, 'indisponibilites' | 'tournees'>>;

export function fabriquerTechnicienDeDemonstration(
  description: DescriptionTechnicienDeDemonstration,
): TechnicienDeDemonstration {
  const { indisponibilites = [], tournees = [], ...fiche } = description;
  return { ...fabriquerTechnicien(fiche), indisponibilites, tournees };
}

export interface JeuDeDemonstration {
  techniciens: TechnicienDeDemonstration[];
  clients: Client[];
  /** Comptes utilisateurs (GET /users) : une fiche technicien se crée pour l'un d'eux. */
  comptes: CompteUtilisateur[];
  interventionsAPlanifier: Intervention[];
  /** Signatures du client par identifiant d'intervention (GET /interventions/:id/signature). */
  signatures: Record<number, SignatureIntervention>;
}

/** Le client et sa première adresse en service, pour y rattacher une intervention. */
export function chez(clients: Client[], idClient: number): [Client, Adresse] {
  const client = clients.find(({ id }) => id === idClient);
  const adresse = client?.adresses.find(({ archive }) => !archive);
  if (!client || !adresse) {
    throw new Error(`Client de démonstration ${idClient} introuvable ou sans adresse en service`);
  }
  return [client, adresse];
}

export function creerJeuDeDemonstration(lundi: DateIso): JeuDeDemonstration {
  const clients = clientsDeDemonstration();
  const mardi = ajouterJours(lundi, 1);

  const fuite = planifier(
    fabriquerInterventionChez(...chez(clients, CLIENT_MARIE_CLAUDE_HOARAU), {
      id: 1,
      type: 'Recherche de fuite',
      dureeEstimeeMin: 60,
    }),
    lundi,
    '08:00',
    1,
  );
  const chauffeEau = {
    ...planifier(
      fabriquerInterventionChez(...chez(clients, CLIENT_BOULANGERIE_GRONDIN), {
        id: 2,
        type: 'Chauffe-eau',
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
    fabriquerInterventionChez(...chez(clients, CLIENT_JEAN_YVES_FONTAINE), {
      id: 3,
      type: 'Remplacement de robinet',
      dureeEstimeeMin: 45,
    }),
    mardi,
    '09:00',
    1,
  );

  return {
    techniciens: techniciensDeDemonstration(lundi, [
      { id: 10, dateTournee: lundi, interventions: [fuite, chauffeEau] },
      { id: 20, dateTournee: mardi, interventions: [robinet] },
    ]),
    clients,
    comptes: comptesUtilisateursDeDemonstration(),
    interventionsAPlanifier: [
      fabriquerInterventionChez(...chez(clients, CLIENT_ROSEMAY_NATIVEL), {
        id: 4,
        type: 'Débouchage',
        dureeEstimeeMin: 60,
        urgence: 'PRIORITAIRE',
      }),
      fabriquerInterventionChez(...chez(clients, CLIENT_RESIDENCE_LATANIERS), {
        id: 5,
        type: 'Recherche de fuite',
        dureeEstimeeMin: 120,
      }),
    ],
    signatures: {},
  };
}

type TourneeDuJeu = TechnicienDuPlanning['tournees'][number];

/**
 * Trois techniciens en service et un archivé. Chacun a une indisponibilité la semaine suivante :
 * toujours à venir, quel que soit le jour où la démonstration tourne, sans gêner les tournées.
 * La formation de Marie reste en plus le jeudi de la semaine affichée, pour que le planning
 * montre une indisponibilité (PagePlanning.test.tsx) ; elle est passée à partir du vendredi.
 */
function techniciensDeDemonstration(
  lundi: DateIso,
  [tourneeJean, tourneeMarie]: [TourneeDuJeu, TourneeDuJeu],
): TechnicienDeDemonstration[] {
  const jeudi = ajouterJours(lundi, 3);
  const lundiSuivant = ajouterJours(lundi, 7);
  return [
    fabriquerTechnicienDeDemonstration({
      id: 1,
      utilisateurId: TECHNICIEN_DEMONSTRATION.id,
      nom: TECHNICIEN_DEMONSTRATION.nom,
      prenom: TECHNICIEN_DEMONSTRATION.prenom,
      email: TECHNICIEN_DEMONSTRATION.email,
      telephone: '0692111111',
      couleurPlanning: '#0F766E',
      indisponibilites: [
        indisponibilite(1, lundiSuivant, '07:00', ajouterJours(lundiSuivant, 1), '19:00', 'Congé'),
      ],
      tournees: [tourneeJean],
    }),
    fabriquerTechnicienDeDemonstration({
      id: 2,
      utilisateurId: UTILISATEUR_ID_MARIE_TECHER,
      nom: 'Técher',
      prenom: 'Marie',
      email: 'marie.techer@plumbly.demo',
      telephone: '0692222222',
      couleurPlanning: '#AF4C00',
      indisponibilites: [
        indisponibilite(2, jeudi, '07:00', jeudi, '19:00', 'Formation'),
        indisponibilite(
          4,
          ajouterJours(lundiSuivant, 3),
          '07:00',
          ajouterJours(lundiSuivant, 3),
          '12:00',
          'Récupération',
        ),
      ],
      tournees: [tourneeMarie],
    }),
    fabriquerTechnicienDeDemonstration({
      id: 3,
      utilisateurId: UTILISATEUR_ID_PAUL_LEBON,
      nom: 'Lebon',
      prenom: 'Paul',
      email: 'paul.lebon@plumbly.demo',
      telephone: '0692333333',
      couleurPlanning: '#4F46E5',
      indisponibilites: [
        indisponibilite(
          3,
          ajouterJours(lundiSuivant, 2),
          '13:00',
          ajouterJours(lundiSuivant, 2),
          '17:00',
          'Visite médicale',
        ),
      ],
    }),
    fabriquerTechnicienDeDemonstration({
      id: 4,
      utilisateurId: UTILISATEUR_ID_SEBASTIEN_PAYET,
      nom: 'Payet',
      prenom: 'Sébastien',
      email: 'sebastien.payet@plumbly.demo',
      telephone: '0692444444',
      couleurPlanning: '#AD1457',
      archive: true,
      archiveLe: '2026-10-30T04:00:00.000Z',
    }),
  ];
}

function indisponibilite(
  id: number,
  jourDebut: DateIso,
  heureDebut: string,
  jourFin: DateIso,
  heureFin: string,
  motif: string,
): Indisponibilite {
  return {
    id,
    debut: versInstant(jourDebut, heureDebut),
    fin: versInstant(jourFin, heureFin),
    motif,
  };
}
