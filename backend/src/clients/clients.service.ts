import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Horloge } from '../commun/horloge.js';
import { type PageApi, paginer } from '../commun/validation.js';
import { versInterventionApi } from '../tournees/tournees.presentation.js';
import type { InterventionApi } from '../tournees/tournees.types.js';
import { versClientApi } from './clients.presentation.js';
import {
  type ClientVerrouille,
  ClientsRepository,
  type OperationsSurClient,
} from './clients.repository.js';
import type {
  ClientApi,
  FiltresClients,
  FiltresHistorique,
  ModificationClient,
  NouveauClient,
} from './clients.types.js';
import { verifierIdentite } from './regles-clients.js';

/** Gestion des clients : US06 à US10, règles RG21 et RG22 du cahier des charges. */
@Injectable()
export class ClientsService {
  constructor(
    private readonly depot: ClientsRepository,
    private readonly horloge: Horloge,
  ) {}

  /** US08 : recherche et liste paginée, adresses en service seulement. */
  async lister(filtres: FiltresClients): Promise<PageApi<ClientApi>> {
    const { clients, total } = await this.depot.rechercher(filtres);
    return paginer(clients.map(versClientApi), total, filtres);
  }

  /** US06 : le client et sa première adresse, créés ensemble (RG21). */
  async creer(nouveau: NouveauClient): Promise<ClientApi> {
    return versClientApi(await this.depot.creer(nouveau));
  }

  /** Un client archivé reste consultable, avec toutes ses adresses, pour l'historique. */
  async consulter(idClient: number): Promise<ClientApi> {
    const client = await this.depot.trouver(idClient);
    if (client === null) {
      throw new NotFoundException('Client introuvable.');
    }
    return versClientApi(client);
  }

  /** US10 : la règle nom / raison sociale est vérifiée sur le client modifié. */
  async modifier(idClient: number, modification: ModificationClient): Promise<ClientApi> {
    await this.depot.modifierClient(async (operations) => {
      const client = await this.verrouillerClientModifiable(operations, idClient);
      verifierIdentite({
        typeClient: modification.typeClient ?? client.typeClient,
        nomClient: modification.nomClient === undefined ? client.nomClient : modification.nomClient,
        raisonSociale:
          modification.raisonSociale === undefined
            ? client.raisonSociale
            : modification.raisonSociale,
      });
      await operations.modifierClient(idClient, modification);
    });
    return this.consulter(idClient);
  }

  /** US10 et RG22 : le client sort des listes mais reste dans l'historique. */
  async archiver(idClient: number): Promise<ClientApi> {
    await this.depot.modifierClient(async (operations) => {
      const client = await this.verrouillerClient(operations, idClient);
      if (client.archive) {
        throw new BadRequestException('Ce client est déjà archivé.');
      }
      const actives = await operations.compterInterventionsActivesDuClient(idClient);
      if (actives > 0) {
        throw new ConflictException(
          'Impossible d’archiver ce client tant qu’il a des interventions à planifier, ' +
            `planifiées ou en cours (${actives} actuellement) : terminez-les ou annulez-les d’abord.`,
        );
      }
      await operations.archiverClient(idClient, this.horloge.maintenant());
    });
    return this.consulter(idClient);
  }

  /** US09 : interventions de toutes les adresses du client, de la plus récente à la plus ancienne. */
  async historique(
    idClient: number,
    filtres: FiltresHistorique,
  ): Promise<PageApi<InterventionApi>> {
    if (!(await this.depot.existe(idClient))) {
      throw new NotFoundException('Client introuvable.');
    }
    const { interventions, total } = await this.depot.listerInterventions(idClient, filtres);
    const maintenant = this.horloge.maintenant();
    return paginer(
      interventions.map((intervention) => versInterventionApi(intervention, maintenant)),
      total,
      filtres,
    );
  }

  private async verrouillerClient(
    operations: OperationsSurClient,
    idClient: number,
  ): Promise<ClientVerrouille> {
    const client = await operations.verrouillerClient(idClient);
    if (client === null) {
      throw new NotFoundException('Client introuvable.');
    }
    return client;
  }

  private async verrouillerClientModifiable(
    operations: OperationsSurClient,
    idClient: number,
  ): Promise<ClientVerrouille> {
    const client = await this.verrouillerClient(operations, idClient);
    if (client.archive) {
      throw new BadRequestException('Ce client est archivé : il ne peut plus être modifié.');
    }
    return client;
  }
}
