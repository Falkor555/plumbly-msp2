import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.ts';
import { estUnDelaiDeVerrouDepasse } from '../../prisma/erreurs-postgres.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { IdentiteClient, NouveauClient, NouvelleAdresse } from '../clients.types.js';
import type { ClientExistant } from './import-clients.types.js';

/*
 * Accès aux données de l'import des clients (US31, RG29).
 *
 * Tout l'enregistrement se fait dans une seule transaction : une erreur de la base annule toutes
 * les lignes du fichier. Le verrou consultatif pris au début fait passer deux imports l'un après
 * l'autre ; sans contrainte d'unicité sur le téléphone ni l'e-mail d'un client, c'est lui qui
 * empêche deux imports simultanés du même fichier de créer chaque client deux fois.
 *
 * L'ordre des verrous du planning (technicien, puis tournée, puis intervention) ne s'applique pas
 * ici : l'import ne verrouille aucune de ces tables, seulement des lignes de client.
 */

/** Clé du verrou consultatif propre à l'import des clients (aucun autre verrou consultatif). */
export const CLE_DU_VERROU_D_IMPORT = 4_700_001;
// Jusqu'à 10 s d'attente du verrou, puis jusqu'à 1 000 créations : la limite de 5 s de Prisma ne suffit pas.
const DUREE_MAXIMALE_DE_L_IMPORT_MS = 30_000;

/** Le verrou n'a pas été obtenu en 10 secondes : un autre import est en cours. */
export class ImportDejaEnCours extends Error {
  constructor() {
    super('Un import de clients est déjà en cours.');
    this.name = 'ImportDejaEnCours';
  }
}

/** Client à mettre à jour, relu sous verrou, avec ses adresses non archivées. */
export interface ClientAMettreAJour extends IdentiteClient {
  id: number;
  archive: boolean;
  adresses: Pick<NouvelleAdresse, 'rue' | 'codePostal' | 'ville'>[];
}

/** Lectures et écritures faites dans la transaction de l'import, après la prise du verrou. */
export interface OperationsDImport {
  trouverClientsCorrespondants(cles: ClesDeRecherche): Promise<ClientExistant[]>;
  creerClient(client: NouveauClient): Promise<number>;
  /** Verrouille les lignes (FOR UPDATE, dans l'ordre des identifiants) puis les relit. */
  verrouillerClients(identifiants: number[]): Promise<ClientAMettreAJour[]>;
  modifierClient(idClient: number, modification: Partial<IdentiteClient>): Promise<void>;
  ajouterAdresse(idClient: number, adresse: NouvelleAdresse): Promise<void>;
}

export interface ClesDeRecherche {
  telephones: string[];
  emails: string[];
}

@Injectable()
export class ImportClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Pour l'aperçu : aucune écriture, aucun verrou. */
  trouverClientsCorrespondants(cles: ClesDeRecherche): Promise<ClientExistant[]> {
    return rechercherCorrespondants(this.prisma, cles);
  }

  /**
   * Transaction unique (RG29), en READ COMMITTED (niveau par défaut, à ne pas changer) : les
   * doublons sont relus par une requête postérieure au verrou, qui voit donc les clients créés
   * par l'import précédent. En REPEATABLE READ, elle garderait l'instantané d'avant l'attente.
   */
  importer<T>(travail: (operations: OperationsDImport) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await prendreLeVerrouDImport(tx);
        return travail(creerOperations(tx));
      },
      { timeout: DUREE_MAXIMALE_DE_L_IMPORT_MS },
    );
  }
}

/**
 * pg_advisory_xact_lock se libère tout seul à la fin de la transaction. lock_timeout vaut pour
 * toute la suite de la transaction : un délai dépassé ailleurs (verrou de ligne) donne une erreur
 * de la base ordinaire, seul celui-ci répond 409.
 */
async function prendreLeVerrouDImport(tx: Prisma.TransactionClient): Promise<void> {
  // Littéral, sans paramètre : SET n'accepte pas de valeur liée.
  await tx.$executeRaw`SET LOCAL lock_timeout = '10s'`;
  try {
    // $executeRaw : $queryRaw ne sait pas lire la colonne de type void que renvoie la fonction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLE_DU_VERROU_D_IMPORT}::bigint)`;
  } catch (erreur) {
    if (estUnDelaiDeVerrouDepasse(erreur)) {
      throw new ImportDejaEnCours();
    }
    throw erreur;
  }
}

/** Une seule requête pour tout le fichier, téléphones et e-mails en paramètres liés. */
function rechercherCorrespondants(
  client: PrismaService | Prisma.TransactionClient,
  { telephones, emails }: ClesDeRecherche,
): Promise<ClientExistant[]> {
  return client.$queryRaw<ClientExistant[]>`
    SELECT id_client AS id, telephone, email_client AS "emailClient", archive
    FROM client
    WHERE telephone = ANY(${telephones}::text[]) OR lower(email_client) = ANY(${emails}::text[])
    ORDER BY id_client`;
}

function creerOperations(tx: Prisma.TransactionClient): OperationsDImport {
  return {
    trouverClientsCorrespondants: (cles) => rechercherCorrespondants(tx, cles),

    async creerClient({ adresse, ...identite }) {
      // Comme POST /clients (RG21), sans relire le client : 1 000 lignes doivent tenir en 30 s.
      const cree = await tx.client.create({
        data: { ...identite, adresses: { create: [adresse] } },
        select: { id: true },
      });
      return cree.id;
    },

    async verrouillerClients(identifiants) {
      if (identifiants.length === 0) {
        return [];
      }
      await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM client WHERE id_client = ANY(${identifiants}::int[])
        ORDER BY id_client FOR UPDATE`;
      // Relus par une seconde requête, après les verrous : en READ COMMITTED, une requête voit les
      // données de son début, et l'archivage d'une adresse ne modifie pas la ligne du client.
      return tx.client.findMany({
        where: { id: { in: identifiants } },
        select: {
          id: true,
          typeClient: true,
          nomClient: true,
          prenomClient: true,
          raisonSociale: true,
          telephone: true,
          emailClient: true,
          archive: true,
          adresses: {
            where: { archive: false },
            select: { rue: true, codePostal: true, ville: true },
          },
        },
      });
    },

    async modifierClient(idClient, modification) {
      await tx.client.update({ where: { id: idClient }, data: modification });
    },

    async ajouterAdresse(idClient, adresse) {
      await tx.adresse.create({ data: { ...adresse, idClient } });
    },
  };
}
