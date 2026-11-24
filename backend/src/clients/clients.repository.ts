import { Injectable } from '@nestjs/common';
import { type Adresse, Prisma, type TypeClient } from '../generated/prisma/client.ts';
import {
  INTERVENTION_DETAILLEE,
  type InterventionDetaillee,
} from '../interventions/intervention-detaillee.js';
import { dansLOrdreDe, echapperMotif } from '../prisma/outils-de-recherche.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  FiltresClients,
  FiltresHistorique,
  IdentiteClient,
  ModificationAdresse,
  NouveauClient,
  NouvelleAdresse,
  TriClients,
} from './clients.types.js';
import { STATUTS_ACTIFS } from './regles-clients.js';

const TOUTES_LES_ADRESSES = {
  include: { adresses: { orderBy: { id: 'asc' } } },
} as const satisfies Prisma.ClientDefaultArgs;

// Les listes ne montrent que les adresses en service (contrat, GET /clients).
const ADRESSES_ACTIVES = {
  include: { adresses: { where: { archive: false }, orderBy: { id: 'asc' } } },
} as const satisfies Prisma.ClientDefaultArgs;

export type ClientAvecAdresses = Prisma.ClientGetPayload<{ include: { adresses: true } }>;

export interface ClientVerrouille {
  id: number;
  typeClient: TypeClient;
  nomClient: string | null;
  raisonSociale: string | null;
  archive: boolean;
}

/**
 * Lectures et écritures faites dans la transaction d'une modification de client, sur la ligne
 * du client verrouillée. Le service y applique les règles sans connaître Prisma ni SQL.
 */
export interface OperationsSurClient {
  /** Verrouille la ligne du client (FOR UPDATE) : null s'il n'existe pas. */
  verrouillerClient(idClient: number): Promise<ClientVerrouille | null>;
  compterInterventionsActivesDuClient(idClient: number): Promise<number>;
  modifierClient(idClient: number, modification: Partial<IdentiteClient>): Promise<void>;
  archiverClient(idClient: number, le: Date): Promise<void>;
  trouverAdresse(idAdresse: number): Promise<AdresseDuClient | null>;
  compterAdressesActives(idClient: number): Promise<number>;
  compterInterventionsActivesDeLAdresse(idAdresse: number): Promise<number>;
  ajouterAdresse(idClient: number, adresse: NouvelleAdresse): Promise<Adresse>;
  modifierAdresse(idAdresse: number, modification: ModificationAdresse): Promise<Adresse>;
  archiverAdresse(idAdresse: number, le: Date): Promise<Adresse>;
}

export interface AdresseDuClient {
  id: number;
  idClient: number;
  archive: boolean;
}

/*
 * Nom affiché, comme le calcule l'API (interventions.presentation.ts, nomAffiche) : la recherche et
 * le tri par défaut portent sur lui, ils sont donc faits en SQL.
 */
const NOM_AFFICHE = Prisma.sql`CASE WHEN c.type_client = 'PROFESSIONNEL'
  THEN coalesce(c.raison_sociale, '')
  ELSE concat_ws(' ', c.prenom_client, c.nom_client) END`;

// Fragments SQL fixes, choisis dans une liste fermée : aucune donnée reçue n'entre dans le tri.
// L'identifiant départage les ex aequo, pour que la pagination ne saute ni ne répète aucun client.
const ORDRES: Record<TriClients, Prisma.Sql> = {
  nomAffiche: Prisma.sql`lower(unaccent(${NOM_AFFICHE})) ASC, c.id_client ASC`,
  '-nomAffiche': Prisma.sql`lower(unaccent(${NOM_AFFICHE})) DESC, c.id_client DESC`,
  creeLe: Prisma.sql`c.cree_le ASC, c.id_client ASC`,
  '-creeLe': Prisma.sql`c.cree_le DESC, c.id_client DESC`,
};

/** Accès aux données des clients : seul fichier du module qui parle à PostgreSQL. */
@Injectable()
export class ClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Une page de clients. Les identifiants sont choisis et triés en SQL (recherche sans accents,
   * tri sur le nom affiché), puis Prisma charge les clients et leurs adresses.
   */
  async rechercher(filtres: FiltresClients): Promise<{
    clients: ClientAvecAdresses[];
    total: number;
  }> {
    const conditions = conditionsDeRecherche(filtres);
    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM client c WHERE ${conditions}`;
    const lignes = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT c.id_client AS id FROM client c
      WHERE ${conditions}
      ORDER BY ${ORDRES[filtres.tri]}
      LIMIT ${filtres.limit} OFFSET ${(filtres.page - 1) * filtres.limit}`;
    const ids = lignes.map(({ id }) => id);
    const clients = await this.prisma.client.findMany({
      where: { id: { in: ids } },
      ...ADRESSES_ACTIVES,
    });
    return { clients: dansLOrdreDe(ids, clients), total };
  }

  trouver(idClient: number): Promise<ClientAvecAdresses | null> {
    return this.prisma.client.findUnique({ where: { id: idClient }, ...TOUTES_LES_ADRESSES });
  }

  async existe(idClient: number): Promise<boolean> {
    const client = await this.prisma.client.findUnique({
      where: { id: idClient },
      select: { id: true },
    });
    return client !== null;
  }

  /** RG21 : création imbriquée, que Prisma exécute dans une seule transaction. */
  creer({ adresse, ...identite }: NouveauClient): Promise<ClientAvecAdresses> {
    return this.prisma.client.create({
      data: { ...identite, adresses: { create: [adresse] } },
      ...TOUTES_LES_ADRESSES,
    });
  }

  /** Historique de toutes les adresses du client, de la plus récente à la plus ancienne. */
  async listerInterventions(
    idClient: number,
    filtres: FiltresHistorique,
  ): Promise<{ interventions: InterventionDetaillee[]; total: number }> {
    const where: Prisma.InterventionWhereInput = {
      adresse: { idClient },
      statut: filtres.statuts === undefined ? undefined : { in: filtres.statuts },
    };
    const interventions = await this.prisma.intervention.findMany({
      where,
      ...INTERVENTION_DETAILLEE,
      orderBy: [{ creeLe: 'desc' }, { id: 'desc' }],
      skip: (filtres.page - 1) * filtres.limit,
      take: filtres.limit,
    });
    const total = await this.prisma.intervention.count({ where });
    return { interventions, total };
  }

  /**
   * Exécute une modification dans une transaction, sur la ligne du client verrouillée : deux
   * modifications simultanées du même client (archivage, ajout ou archivage d'adresse) passent
   * l'une après l'autre, et chacune vérifie les règles sur l'état laissé par la précédente.
   */
  modifierClient<T>(travail: (operations: OperationsSurClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => travail(creerOperations(tx)));
  }
}

function creerOperations(tx: Prisma.TransactionClient): OperationsSurClient {
  return {
    async verrouillerClient(idClient) {
      // Prisma ne sait pas écrire FOR UPDATE : verrou posé par une requête paramétrée.
      const verrou = await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM client WHERE id_client = ${idClient} FOR UPDATE`;
      if (verrou.length === 0) {
        return null;
      }
      return tx.client.findUniqueOrThrow({
        where: { id: idClient },
        select: { id: true, typeClient: true, nomClient: true, raisonSociale: true, archive: true },
      });
    },

    compterInterventionsActivesDuClient(idClient) {
      return tx.intervention.count({
        where: { adresse: { idClient }, statut: { in: STATUTS_ACTIFS } },
      });
    },

    async modifierClient(idClient, modification) {
      await tx.client.update({ where: { id: idClient }, data: modification });
    },

    async archiverClient(idClient, le) {
      await tx.client.update({ where: { id: idClient }, data: { archive: true, archiveLe: le } });
    },

    trouverAdresse(idAdresse) {
      return tx.adresse.findUnique({
        where: { id: idAdresse },
        select: { id: true, idClient: true, archive: true },
      });
    },

    compterAdressesActives(idClient) {
      return tx.adresse.count({ where: { idClient, archive: false } });
    },

    compterInterventionsActivesDeLAdresse(idAdresse) {
      return tx.intervention.count({ where: { idAdresse, statut: { in: STATUTS_ACTIFS } } });
    },

    ajouterAdresse(idClient, adresse) {
      return tx.adresse.create({ data: { ...adresse, idClient } });
    },

    modifierAdresse(idAdresse, modification) {
      return tx.adresse.update({ where: { id: idAdresse }, data: modification });
    },

    archiverAdresse(idAdresse, le) {
      return tx.adresse.update({
        where: { id: idAdresse },
        data: { archive: true, archiveLe: le },
      });
    },
  };
}

/**
 * Filtres de GET /clients en SQL paramétré : chaque valeur reçue est passée en paramètre lié,
 * jamais concaténée à la requête (TI10).
 */
function conditionsDeRecherche(filtres: FiltresClients): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (!filtres.archives) {
    conditions.push(Prisma.sql`c.archive = false`);
  }
  if (filtres.typeClient !== undefined) {
    conditions.push(Prisma.sql`c.type_client = ${filtres.typeClient}::type_client`);
  }
  if (filtres.recherche !== undefined) {
    const motif = `%${echapperMotif(filtres.recherche)}%`;
    // Le téléphone est enregistré sans espaces ni points : la saisie est nettoyée de la même façon.
    const motifTelephone = `%${echapperMotif(filtres.recherche.replace(/[ .]/g, ''))}%`;
    conditions.push(Prisma.sql`(
      unaccent(coalesce(c.nom_client, '')) ILIKE unaccent(${motif})
      OR unaccent(coalesce(c.prenom_client, '')) ILIKE unaccent(${motif})
      OR unaccent(coalesce(c.raison_sociale, '')) ILIKE unaccent(${motif})
      OR unaccent(${NOM_AFFICHE}) ILIKE unaccent(${motif})
      OR c.telephone LIKE ${motifTelephone}
      OR EXISTS (
        SELECT 1 FROM adresse a
        WHERE a.id_client = c.id_client AND a.archive = false
          AND unaccent(a.ville) ILIKE unaccent(${motif})
      )
    )`);
  }
  return conditions.length === 0 ? Prisma.sql`TRUE` : Prisma.join(conditions, ' AND ');
}
