import { Injectable } from '@nestjs/common';
import { versColonneDate } from '../commun/fuseau-metier.js';
import { Prisma, type Role, StatutIntervention } from '../generated/prisma/client.ts';
import { dansLOrdreDe, echapperMotif } from '../prisma/outils-de-recherche.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  FiltresTechniciens,
  ModificationTechnicien,
  TriTechniciens,
} from './techniciens.types.js';

// select plutôt qu'include sur utilisateur : le hash du mot de passe ne quitte jamais la base.
const AVEC_COMPTE = {
  include: { utilisateur: { select: { nom: true, prenom: true, email: true, actif: true } } },
} as const satisfies Prisma.TechnicienDefaultArgs;

export type TechnicienAvecCompte = Prisma.TechnicienGetPayload<typeof AVEC_COMPTE>;

/** Compte utilisateur auquel une fiche technicien peut être rattachée. */
export interface CompteARattacher {
  id: number;
  role: Role;
  actif: boolean;
  aDejaUneFiche: boolean;
}

export interface TechnicienVerrouille {
  id: number;
  archive: boolean;
}

/**
 * Lectures et écritures faites dans la transaction d'une modification de technicien, sur sa
 * ligne verrouillée. Le service y applique les règles sans connaître Prisma ni SQL.
 */
export interface OperationsSurTechnicien {
  /** Verrouille la ligne du technicien (FOR UPDATE) : null s'il n'existe pas. */
  verrouillerTechnicien(idTechnicien: number): Promise<TechnicienVerrouille | null>;
  /** Interventions en cours, ou planifiées dans une tournée de ce jour ou d'un jour suivant. */
  compterInterventionsAVenir(idTechnicien: number, aPartirDu: string): Promise<number>;
  modifierTechnicien(idTechnicien: number, modification: ModificationTechnicien): Promise<void>;
  archiverTechnicien(idTechnicien: number, le: Date): Promise<void>;
}

const CODE_PRISMA_UNICITE = 'P2002';

// Fragments SQL fixes, choisis dans une liste fermée : aucune donnée reçue n'entre dans le tri.
const ORDRES: Record<TriTechniciens, Prisma.Sql> = {
  nom: Prisma.sql`lower(unaccent(u.nom)) ASC, lower(unaccent(u.prenom)) ASC, t.id_technicien ASC`,
  '-nom': Prisma.sql`lower(unaccent(u.nom)) DESC, lower(unaccent(u.prenom)) DESC, t.id_technicien DESC`,
};

/** Accès aux données des techniciens : seul fichier du module qui parle à PostgreSQL. */
@Injectable()
export class TechniciensRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Une page de techniciens, triée et filtrée en SQL (recherche sans accents sur le compte). */
  async rechercher(filtres: FiltresTechniciens): Promise<{
    techniciens: TechnicienAvecCompte[];
    total: number;
  }> {
    const conditions = conditionsDeRecherche(filtres);
    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM technicien t JOIN utilisateur u ON u.id_utilisateur = t.id_utilisateur
      WHERE ${conditions}`;
    const lignes = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT t.id_technicien AS id
      FROM technicien t JOIN utilisateur u ON u.id_utilisateur = t.id_utilisateur
      WHERE ${conditions}
      ORDER BY ${ORDRES[filtres.tri]}
      LIMIT ${filtres.limit} OFFSET ${(filtres.page - 1) * filtres.limit}`;
    const ids = lignes.map(({ id }) => id);
    const techniciens = await this.prisma.technicien.findMany({
      where: { id: { in: ids } },
      ...AVEC_COMPTE,
    });
    return { techniciens: dansLOrdreDe(ids, techniciens), total };
  }

  trouver(idTechnicien: number): Promise<TechnicienAvecCompte | null> {
    return this.prisma.technicien.findUnique({ where: { id: idTechnicien }, ...AVEC_COMPTE });
  }

  async trouverCompte(idUtilisateur: number): Promise<CompteARattacher | null> {
    const compte = await this.prisma.utilisateur.findUnique({
      where: { id: idUtilisateur },
      select: { id: true, role: true, actif: true, technicien: { select: { id: true } } },
    });
    return compte === null
      ? null
      : {
          id: compte.id,
          role: compte.role,
          actif: compte.actif,
          aDejaUneFiche: compte.technicien !== null,
        };
  }

  /** Couleurs des techniciens en service, pour en proposer une libre au suivant. */
  async couleursEnService(): Promise<string[]> {
    const techniciens = await this.prisma.technicien.findMany({
      where: { archive: false },
      select: { couleurPlanning: true },
    });
    return techniciens.map(({ couleurPlanning }) => couleurPlanning);
  }

  /** Renvoie null si le compte a déjà une fiche (D02, contrainte UNIQUE sur id_utilisateur). */
  async creer(technicien: {
    idUtilisateur: number;
    telephone: string;
    couleurPlanning: string;
  }): Promise<TechnicienAvecCompte | null> {
    try {
      return await this.prisma.technicien.create({ data: technicien, ...AVEC_COMPTE });
    } catch (erreur) {
      // La contrainte UNIQUE tranche aussi deux créations simultanées pour le même compte.
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === CODE_PRISMA_UNICITE
      ) {
        return null;
      }
      throw erreur;
    }
  }

  /**
   * Exécute une modification dans une transaction, sur la ligne du technicien verrouillée :
   * deux modifications simultanées du même technicien passent l'une après l'autre.
   */
  modifierTechnicien<T>(travail: (operations: OperationsSurTechnicien) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => travail(creerOperations(tx)));
  }
}

function creerOperations(tx: Prisma.TransactionClient): OperationsSurTechnicien {
  return {
    async verrouillerTechnicien(idTechnicien) {
      // Prisma ne sait pas écrire FOR UPDATE : verrou posé par une requête paramétrée.
      const verrou = await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM technicien WHERE id_technicien = ${idTechnicien} FOR UPDATE`;
      if (verrou.length === 0) {
        return null;
      }
      return tx.technicien.findUniqueOrThrow({
        where: { id: idTechnicien },
        select: { id: true, archive: true },
      });
    },

    compterInterventionsAVenir(idTechnicien, aPartirDu) {
      return tx.intervention.count({
        where: {
          tournee: { idTechnicien },
          OR: [
            // Une intervention restée « en cours » bloque l'archivage quelle que soit sa date.
            { statut: StatutIntervention.EN_COURS },
            {
              statut: StatutIntervention.PLANIFIEE,
              tournee: { dateTournee: { gte: versColonneDate(aPartirDu) } },
            },
          ],
        },
      });
    },

    async modifierTechnicien(idTechnicien, modification) {
      await tx.technicien.update({ where: { id: idTechnicien }, data: modification });
    },

    async archiverTechnicien(idTechnicien, le) {
      await tx.technicien.update({
        where: { id: idTechnicien },
        data: { archive: true, archiveLe: le },
      });
    },
  };
}

/** Filtres de GET /technicians en SQL paramétré : aucune valeur reçue n'est concaténée (TI10). */
function conditionsDeRecherche(filtres: FiltresTechniciens): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (!filtres.archives) {
    conditions.push(Prisma.sql`t.archive = false`);
  }
  if (filtres.recherche !== undefined) {
    const motif = `%${echapperMotif(filtres.recherche)}%`;
    conditions.push(Prisma.sql`(
      unaccent(u.nom) ILIKE unaccent(${motif})
      OR unaccent(u.prenom) ILIKE unaccent(${motif})
      OR unaccent(concat_ws(' ', u.prenom, u.nom)) ILIKE unaccent(${motif})
    )`);
  }
  return conditions.length === 0 ? Prisma.sql`TRUE` : Prisma.join(conditions, ' AND ');
}
