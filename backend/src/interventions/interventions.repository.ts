import { Injectable } from '@nestjs/common';
import { ajouterJours, debutDuJourMetier } from '../commun/fuseau-metier.js';
import { Prisma, StatutIntervention, type Urgence } from '../generated/prisma/client.ts';
import { dansLOrdreDe, echapperMotif, NOM_AFFICHE_CLIENT } from '../prisma/outils-de-recherche.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  decalerRangs,
  listerIndisponibilites,
  listerInterventionsDuTechnicien,
  type TourneeVerrouillee,
  verrouillerLigneIntervention,
  verrouillerTechnicienDeLaTournee,
  verrouillerTournee,
} from '../tournees/operations-verrouillees.js';
import type {
  Creneau,
  Indisponibilite,
  InterventionPlanifiee,
} from '../tournees/regles-planification.js';
import { INTERVENTION_DETAILLEE, type InterventionDetaillee } from './intervention-detaillee.js';
import type { FiltresInterventions, TriInterventions } from './interventions.types.js';

/** Adresse choisie pour une intervention, lue sous verrou partagé de son client. */
export interface AdresseUtilisable {
  adresseArchivee: boolean;
  clientArchive: boolean;
}

/** Ligne écrite par POST /interventions : statut « à planifier » par défaut (RG01). */
export interface InterventionACreer {
  idAdresse: number;
  idTypeIntervention: number;
  idCreateur: number;
  description: string;
  urgence: Urgence;
  dureeEstimeeMin: number;
}

/**
 * Lectures et écritures faites dans la transaction d'une création d'intervention.
 * Le service y applique les règles de gestion sans connaître Prisma ni SQL.
 */
export interface OperationsDeCreation {
  /**
   * Adresse et client, null si l'adresse n'existe pas. Le client est verrouillé en partage
   * (FOR SHARE) : son archivage, ou celui de l'adresse, attend la fin de la création.
   */
  verrouillerAdresse(idAdresse: number): Promise<AdresseUtilisable | null>;
  /** Durée par défaut du type, null s'il n'existe pas. */
  trouverDureeParDefaut(idTypeIntervention: number): Promise<number | null>;
  creer(intervention: InterventionACreer): Promise<number>;
}

/** Ligne de l'intervention, lue après l'avoir verrouillée. */
export interface InterventionVerrouillee {
  id: number;
  statut: StatutIntervention;
  idTournee: number | null;
  ordreTournee: number | null;
  debutPrevu: Date | null;
  dureeEstimeeMin: number;
}

/** Tournée qui contient l'intervention, et compte du technicien qui la fait (RG03). */
export interface Affectation {
  dateTournee: Date;
  idTechnicien: number;
  idCompteDuTechnicien: number;
}

/** Champs modifiables par PATCH /interventions/:id, sous leur nom en base. */
export interface ChampsModifiables {
  idAdresse?: number;
  idTypeIntervention?: number;
  description?: string;
  urgence?: Urgence;
  dureeEstimeeMin?: number;
}

/**
 * Lectures et écritures faites dans la transaction d'une modification d'intervention.
 * Les verrous du planning (technicien, tournée) sont partagés avec les tournées
 * (tournees/operations-verrouillees.ts) et se prennent dans le même ordre.
 */
export interface OperationsSurIntervention extends Omit<OperationsDeCreation, 'creer'> {
  /** Tournée de l'intervention, lue sans verrou ; undefined si l'intervention n'existe pas. */
  lireIdTournee(idIntervention: number): Promise<number | null | undefined>;
  /** Verrouille la ligne du technicien de la tournée : null si la tournée n'existe pas. */
  verrouillerTechnicienDeLaTournee(idTournee: number): Promise<number | null>;
  verrouillerTournee(idTournee: number): Promise<TourneeVerrouillee | null>;
  verrouillerIntervention(idIntervention: number): Promise<InterventionVerrouillee | null>;
  lireAffectation(idTournee: number): Promise<Affectation>;
  listerInterventionsDuTechnicien(
    idTechnicien: number,
    creneau: Creneau,
    idInterventionExclue: number,
  ): Promise<InterventionPlanifiee[]>;
  listerIndisponibilites(idTechnicien: number, creneau: Creneau): Promise<Indisponibilite[]>;
  decalerRangs(idTournee: number, aPartirDuRang: number, decalage: 1 | -1): Promise<void>;
  modifier(idIntervention: number, champs: ChampsModifiables): Promise<void>;
  /** ANNULEE, sortie de sa tournée (rang, début prévu), date et motif d'annulation renseignés. */
  annuler(idIntervention: number, annulation: { motif: string; le: Date }): Promise<void>;
  demarrer(idIntervention: number, le: Date): Promise<void>;
  /** Le compte rendu existant est gardé s'il n'en est pas envoyé de nouveau. */
  terminer(idIntervention: number, fin: { le: Date; compteRendu?: string }): Promise<void>;
  enregistrerCompteRendu(idIntervention: number, compteRendu: string): Promise<void>;
}

/*
 * RG18 écrit en SQL, sans compter sur l'ordre de déclaration de l'énumération urgence : les plus
 * urgentes d'abord, puis la plus ancienne demande. Fragments fixes choisis dans une liste fermée :
 * aucune donnée reçue n'entre dans le tri. L'identifiant départage les ex aequo, pour que la
 * pagination ne saute ni ne répète aucune intervention.
 */
const RANG_D_URGENCE = Prisma.sql`CASE i.urgence
  WHEN 'URGENTE' THEN 0 WHEN 'PRIORITAIRE' THEN 1 ELSE 2 END`;

const ORDRES: Record<TriInterventions, Prisma.Sql> = {
  '-urgence': Prisma.sql`${RANG_D_URGENCE} ASC, i.cree_le ASC, i.id_intervention ASC`,
  creeLe: Prisma.sql`i.cree_le ASC, i.id_intervention ASC`,
  '-creeLe': Prisma.sql`i.cree_le DESC, i.id_intervention DESC`,
  debutPrevu: Prisma.sql`i.debut_prevu ASC NULLS LAST, i.id_intervention ASC`,
  '-debutPrevu': Prisma.sql`i.debut_prevu DESC NULLS LAST, i.id_intervention DESC`,
};

// Le client est déduit de l'adresse (modèle de données, section 6) ; la tournée donne le technicien.
const DEPUIS = Prisma.sql`FROM intervention i
  JOIN adresse a ON a.id_adresse = i.id_adresse
  JOIN client c ON c.id_client = a.id_client
  LEFT JOIN tournee t ON t.id_tournee = i.id_tournee`;

/** Accès aux données des interventions : seul fichier du module qui parle à PostgreSQL. */
@Injectable()
export class InterventionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Une page d'interventions. Les identifiants sont choisis et triés en SQL (recherche sans
   * accents, rang d'urgence), puis Prisma charge les interventions et leurs éléments liés.
   */
  async rechercher(filtres: FiltresInterventions): Promise<{
    interventions: InterventionDetaillee[];
    total: number;
  }> {
    const conditions = conditionsDeRecherche(filtres);
    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total ${DEPUIS} WHERE ${conditions}`;
    const lignes = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT i.id_intervention AS id ${DEPUIS}
      WHERE ${conditions}
      ORDER BY ${ORDRES[filtres.tri]}
      LIMIT ${filtres.limit} OFFSET ${(filtres.page - 1) * filtres.limit}`;
    const ids = lignes.map(({ id }) => id);
    const interventions = await this.prisma.intervention.findMany({
      where: { id: { in: ids } },
      ...INTERVENTION_DETAILLEE,
    });
    return { interventions: dansLOrdreDe(ids, interventions), total };
  }

  trouver(idIntervention: number): Promise<InterventionDetaillee | null> {
    return this.prisma.intervention.findUnique({
      where: { id: idIntervention },
      ...INTERVENTION_DETAILLEE,
    });
  }

  creerIntervention(
    travail: (operations: OperationsDeCreation) => Promise<number>,
  ): Promise<number> {
    return this.prisma.$transaction((tx) => travail(creerOperationsDeCreation(tx)));
  }

  /**
   * Exécute une modification dans une transaction. Les vérifications et les écritures se font
   * sur des lignes verrouillées : deux modifications simultanées de la même intervention, ou de
   * sa tournée, passent l'une après l'autre.
   */
  modifierIntervention<T>(
    travail: (operations: OperationsSurIntervention) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => travail(creerOperationsSurIntervention(tx)));
  }
}

/**
 * Filtres de GET /interventions en SQL paramétré : chaque valeur reçue est passée en paramètre
 * lié, jamais concaténée à la requête (TI10).
 */
function conditionsDeRecherche(filtres: FiltresInterventions): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (filtres.statuts !== undefined) {
    const statuts = filtres.statuts.map((statut) => Prisma.sql`${statut}::statut_intervention`);
    conditions.push(Prisma.sql`i.statut IN (${Prisma.join(statuts)})`);
  }
  if (filtres.urgence !== undefined) {
    conditions.push(Prisma.sql`i.urgence = ${filtres.urgence}::urgence`);
  }
  if (filtres.technicienId !== undefined) {
    conditions.push(Prisma.sql`t.id_technicien = ${filtres.technicienId}`);
  }
  if (filtres.clientId !== undefined) {
    conditions.push(Prisma.sql`a.id_client = ${filtres.clientId}`);
  }
  // Bornes en instants UTC : de minuit à La Réunion le jour « du » à minuit le lendemain de « au ».
  if (filtres.du !== undefined) {
    conditions.push(Prisma.sql`i.debut_prevu >= ${debutDuJourMetier(filtres.du)}`);
  }
  if (filtres.au !== undefined) {
    conditions.push(Prisma.sql`i.debut_prevu < ${debutDuJourMetier(ajouterJours(filtres.au, 1))}`);
  }
  if (filtres.recherche !== undefined) {
    const motif = `%${echapperMotif(filtres.recherche)}%`;
    conditions.push(Prisma.sql`(
      unaccent(i.description) ILIKE unaccent(${motif})
      OR unaccent(${NOM_AFFICHE_CLIENT}) ILIKE unaccent(${motif})
    )`);
  }
  return conditions.length === 0 ? Prisma.sql`TRUE` : Prisma.join(conditions, ' AND ');
}

function creerOperationsDeCreation(tx: Prisma.TransactionClient): OperationsDeCreation {
  return {
    async verrouillerAdresse(idAdresse) {
      // Prisma ne sait pas écrire FOR SHARE : requête paramétrée écrite à la main. Le verrou
      // partagé laisse passer les autres créations, mais pas l'archivage, qui verrouille le
      // client en exclusif (clients.repository.ts) puis compte ses interventions actives.
      const lignes = await tx.$queryRaw<AdresseUtilisable[]>`
        SELECT a.archive AS "adresseArchivee", c.archive AS "clientArchive"
        FROM adresse a JOIN client c ON c.id_client = a.id_client
        WHERE a.id_adresse = ${idAdresse}
        FOR SHARE OF c`;
      return lignes[0] ?? null;
    },

    async trouverDureeParDefaut(idTypeIntervention) {
      const type = await tx.typeIntervention.findUnique({
        where: { id: idTypeIntervention },
        select: { dureeDefautMin: true },
      });
      return type?.dureeDefautMin ?? null;
    },

    async creer(intervention) {
      const creee = await tx.intervention.create({ data: intervention, select: { id: true } });
      return creee.id;
    },
  };
}

function creerOperationsSurIntervention(tx: Prisma.TransactionClient): OperationsSurIntervention {
  const { verrouillerAdresse, trouverDureeParDefaut } = creerOperationsDeCreation(tx);
  return {
    verrouillerAdresse,
    trouverDureeParDefaut,

    async lireIdTournee(idIntervention) {
      const intervention = await tx.intervention.findUnique({
        where: { id: idIntervention },
        select: { idTournee: true },
      });
      return intervention === null ? undefined : intervention.idTournee;
    },

    verrouillerTechnicienDeLaTournee: (idTournee) =>
      verrouillerTechnicienDeLaTournee(tx, idTournee),
    verrouillerTournee: (idTournee) => verrouillerTournee(tx, idTournee),

    async verrouillerIntervention(idIntervention) {
      if (!(await verrouillerLigneIntervention(tx, idIntervention))) {
        return null;
      }
      return tx.intervention.findUniqueOrThrow({
        where: { id: idIntervention },
        select: {
          id: true,
          statut: true,
          idTournee: true,
          ordreTournee: true,
          debutPrevu: true,
          dureeEstimeeMin: true,
        },
      });
    },

    async lireAffectation(idTournee) {
      const tournee = await tx.tournee.findUniqueOrThrow({
        where: { id: idTournee },
        select: {
          dateTournee: true,
          idTechnicien: true,
          technicien: { select: { idUtilisateur: true } },
        },
      });
      return {
        dateTournee: tournee.dateTournee,
        idTechnicien: tournee.idTechnicien,
        idCompteDuTechnicien: tournee.technicien.idUtilisateur,
      };
    },

    listerInterventionsDuTechnicien: (idTechnicien, creneau, idInterventionExclue) =>
      listerInterventionsDuTechnicien(tx, idTechnicien, creneau, idInterventionExclue),
    listerIndisponibilites: (idTechnicien, creneau) =>
      listerIndisponibilites(tx, idTechnicien, creneau),
    decalerRangs: (idTournee, aPartirDuRang, decalage) =>
      decalerRangs(tx, idTournee, aPartirDuRang, decalage),

    async modifier(idIntervention, champs) {
      await tx.intervention.update({ where: { id: idIntervention }, data: champs });
    },

    async annuler(idIntervention, { motif, le }) {
      // demarreeLe est gardé : une intervention commencée puis annulée l'a bien été.
      await tx.intervention.update({
        where: { id: idIntervention },
        data: {
          statut: StatutIntervention.ANNULEE,
          motifAnnulation: motif,
          annuleeLe: le,
          idTournee: null,
          ordreTournee: null,
          debutPrevu: null,
        },
      });
    },

    async demarrer(idIntervention, le) {
      await tx.intervention.update({
        where: { id: idIntervention },
        data: { statut: StatutIntervention.EN_COURS, demarreeLe: le },
      });
    },

    async terminer(idIntervention, { le, compteRendu }) {
      await tx.intervention.update({
        where: { id: idIntervention },
        data: { statut: StatutIntervention.TERMINEE, termineeLe: le, compteRendu },
      });
    },

    async enregistrerCompteRendu(idIntervention, compteRendu) {
      await tx.intervention.update({ where: { id: idIntervention }, data: { compteRendu } });
    },
  };
}
