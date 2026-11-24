import { Injectable } from '@nestjs/common';
import { debutDuJourMetier, versColonneDate, ajouterJours } from '../commun/fuseau-metier.js';
import { Prisma, StatutIntervention } from '../generated/prisma/client.ts';
import { INTERVENTION_DETAILLEE } from '../interventions/intervention-detaillee.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  decalerRangs,
  listerIndisponibilites,
  listerInterventionsDuTechnicien,
  type TourneeVerrouillee,
  verrouillerLigneIntervention,
  verrouillerTechnicienDeLaTournee,
  verrouillerTournee,
} from './operations-verrouillees.js';
import type {
  Creneau,
  Indisponibilite,
  InterventionPlanifiee,
  RangDansLaTournee,
} from './regles-planification.js';

// select plutôt qu'include sur utilisateur : le hash du mot de passe ne quitte jamais la base.
const NOM_UTILISATEUR = { select: { nom: true, prenom: true } } as const;

const TECHNICIEN_RESUME = {
  include: { utilisateur: NOM_UTILISATEUR },
} as const satisfies Prisma.TechnicienDefaultArgs;

const TOURNEE_DETAILLEE = {
  include: {
    technicien: TECHNICIEN_RESUME,
    interventions: { ...INTERVENTION_DETAILLEE, orderBy: { ordreTournee: 'asc' } },
  },
} as const satisfies Prisma.TourneeDefaultArgs;

export type TourneeDetaillee = Prisma.TourneeGetPayload<typeof TOURNEE_DETAILLEE>;
export type TechnicienAvecNom = Prisma.TechnicienGetPayload<typeof TECHNICIEN_RESUME>;

export type TechnicienDuPlanning = Prisma.TechnicienGetPayload<{
  include: {
    utilisateur: typeof NOM_UTILISATEUR;
    indisponibilites: true;
    tournees: { include: { interventions: typeof INTERVENTION_DETAILLEE } };
  };
}>;

export interface TechnicienPlanifiable {
  id: number;
  archive: boolean;
  actif: boolean;
}

export interface InterventionVerrouillee {
  id: number;
  statut: StatutIntervention;
  dureeEstimeeMin: number;
  idTournee: number | null;
}

/**
 * Lectures et écritures faites dans la transaction d'une modification de tournée.
 * Le service y applique les règles de gestion sans connaître Prisma ni SQL.
 */
export interface OperationsSurTournee {
  /**
   * Verrouille la ligne du technicien de la tournée (FOR UPDATE) et renvoie son identifiant :
   * null si la tournée n'existe pas.
   */
  verrouillerTechnicienDeLaTournee(idTournee: number): Promise<number | null>;
  /** Verrouille la ligne de la tournée (FOR UPDATE) : null si elle n'existe pas. */
  verrouillerTournee(idTournee: number): Promise<TourneeVerrouillee | null>;
  verrouillerIntervention(idIntervention: number): Promise<InterventionVerrouillee | null>;
  listerRangs(idTournee: number): Promise<RangDansLaTournee[]>;
  listerInterventionsDuTechnicien(
    idTechnicien: number,
    creneau: Creneau,
    idInterventionExclue: number,
  ): Promise<InterventionPlanifiee[]>;
  listerIndisponibilites(idTechnicien: number, creneau: Creneau): Promise<Indisponibilite[]>;
  planifier(
    idIntervention: number,
    planification: { idTournee: number; debutPrevu: Date; ordreTournee: number },
  ): Promise<void>;
  remettreAPlanifier(idIntervention: number): Promise<void>;
  decalerRangs(idTournee: number, aPartirDuRang: number, decalage: 1 | -1): Promise<void>;
  enregistrerRangs(rangs: Map<number, number>): Promise<void>;
}

const CODE_PRISMA_UNICITE = 'P2002';

/** Accès aux données des tournées : seul fichier du module qui parle à PostgreSQL. */
@Injectable()
export class TourneesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async trouverTechnicien(idTechnicien: number): Promise<TechnicienPlanifiable | null> {
    const technicien = await this.prisma.technicien.findUnique({
      where: { id: idTechnicien },
      select: { id: true, archive: true, utilisateur: { select: { actif: true } } },
    });
    return technicien === null
      ? null
      : { id: technicien.id, archive: technicien.archive, actif: technicien.utilisateur.actif };
  }

  async trouverIdTechnicienDuCompte(idUtilisateur: number): Promise<number | null> {
    const technicien = await this.prisma.technicien.findUnique({
      where: { idUtilisateur },
      select: { id: true },
    });
    return technicien?.id ?? null;
  }

  /** Renvoie null si le technicien a déjà une tournée ce jour-là (RG08, contrainte UNIQUE). */
  async creerTournee(tournee: {
    idTechnicien: number;
    dateTournee: string;
    idCreateur: number;
  }): Promise<number | null> {
    try {
      const creee = await this.prisma.tournee.create({
        data: { ...tournee, dateTournee: versColonneDate(tournee.dateTournee) },
        select: { id: true },
      });
      return creee.id;
    } catch (erreur) {
      // La contrainte UNIQUE (technicien, date) tranche aussi deux créations simultanées.
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === CODE_PRISMA_UNICITE
      ) {
        return null;
      }
      throw erreur;
    }
  }

  trouverTournee(idTournee: number): Promise<TourneeDetaillee | null> {
    return this.prisma.tournee.findUnique({ where: { id: idTournee }, ...TOURNEE_DETAILLEE });
  }

  trouverTourneeDuJour(idTechnicien: number, jour: string): Promise<TourneeDetaillee | null> {
    return this.prisma.tournee.findUnique({
      where: { idTechnicien_dateTournee: { idTechnicien, dateTournee: versColonneDate(jour) } },
      ...TOURNEE_DETAILLEE,
    });
  }

  /**
   * Techniciens actifs et non archivés, avec leurs tournées et leurs indisponibilités sur la
   * période. Ceux qui n'ont pas de tournée sont renvoyés aussi : ce sont les créneaux libres.
   */
  listerPlanning(du: string, au: string, idTechnicien?: number): Promise<TechnicienDuPlanning[]> {
    // Bornes en instants UTC : de minuit à La Réunion le premier jour à minuit le lendemain du dernier.
    const debut = debutDuJourMetier(du);
    const fin = debutDuJourMetier(ajouterJours(au, 1));
    return this.prisma.technicien.findMany({
      where: { archive: false, utilisateur: { actif: true }, id: idTechnicien },
      include: {
        utilisateur: NOM_UTILISATEUR,
        indisponibilites: {
          where: { debut: { lt: fin }, fin: { gt: debut } },
          orderBy: { debut: 'asc' },
        },
        tournees: {
          where: { dateTournee: { gte: versColonneDate(du), lte: versColonneDate(au) } },
          orderBy: { dateTournee: 'asc' },
          include: {
            interventions: { ...INTERVENTION_DETAILLEE, orderBy: { ordreTournee: 'asc' } },
          },
        },
      },
      orderBy: [{ utilisateur: { nom: 'asc' } }, { utilisateur: { prenom: 'asc' } }],
    });
  }

  /**
   * Exécute une modification de tournée dans une transaction. Les vérifications (conflits,
   * rangs) et les écritures se font sur des lignes verrouillées : deux gestionnaires qui
   * planifient la même tournée en même temps passent l'un après l'autre.
   */
  modifierTournee<T>(travail: (operations: OperationsSurTournee) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => travail(creerOperations(tx)));
  }
}

function creerOperations(tx: Prisma.TransactionClient): OperationsSurTournee {
  return {
    verrouillerTechnicienDeLaTournee: (idTournee) =>
      verrouillerTechnicienDeLaTournee(tx, idTournee),
    verrouillerTournee: (idTournee) => verrouillerTournee(tx, idTournee),

    async verrouillerIntervention(idIntervention) {
      // Verrouillée aussi : sans cela, deux gestionnaires pourraient affecter la même
      // intervention à deux tournées différentes au même moment.
      if (!(await verrouillerLigneIntervention(tx, idIntervention))) {
        return null;
      }
      return tx.intervention.findUniqueOrThrow({
        where: { id: idIntervention },
        select: { id: true, statut: true, dureeEstimeeMin: true, idTournee: true },
      });
    },

    async listerRangs(idTournee) {
      const interventions = await tx.intervention.findMany({
        where: { idTournee },
        select: { id: true, statut: true, ordreTournee: true },
        orderBy: { ordreTournee: 'asc' },
      });
      // La contrainte intervention_ordre_si_tournee garantit un rang à toute intervention d'une tournée.
      return interventions.map(({ id, statut, ordreTournee }) => ({
        id,
        statut,
        ordreTournee: ordreTournee as number,
      }));
    },

    listerInterventionsDuTechnicien: (idTechnicien, creneau, idInterventionExclue) =>
      listerInterventionsDuTechnicien(tx, idTechnicien, creneau, idInterventionExclue),
    listerIndisponibilites: (idTechnicien, creneau) =>
      listerIndisponibilites(tx, idTechnicien, creneau),

    async planifier(idIntervention, { idTournee, debutPrevu, ordreTournee }) {
      await tx.intervention.update({
        where: { id: idIntervention },
        data: { idTournee, debutPrevu, ordreTournee, statut: StatutIntervention.PLANIFIEE },
      });
    },

    async remettreAPlanifier(idIntervention) {
      await tx.intervention.update({
        where: { id: idIntervention },
        data: {
          idTournee: null,
          debutPrevu: null,
          ordreTournee: null,
          statut: StatutIntervention.A_PLANIFIER,
        },
      });
    },

    decalerRangs: (idTournee, aPartirDuRang, decalage) =>
      decalerRangs(tx, idTournee, aPartirDuRang, decalage),

    async enregistrerRangs(rangs) {
      for (const [idIntervention, ordreTournee] of rangs) {
        await tx.intervention.update({ where: { id: idIntervention }, data: { ordreTournee } });
      }
    },
  };
}
