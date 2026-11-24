import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UtilisateurConnecte } from '../commun/autorisation/utilisateur-connecte.js';
import { Horloge } from '../commun/horloge.js';
import { type PageApi, paginer } from '../commun/validation.js';
import { Role } from '../generated/prisma/client.ts';
import type { InterventionDetaillee } from './intervention-detaillee.js';
import { versInterventionApi } from './interventions.presentation.js';
import { type AdresseUtilisable, InterventionsRepository } from './interventions.repository.js';
import type {
  FiltresInterventions,
  InterventionApi,
  NouvelleIntervention,
} from './interventions.types.js';

/**
 * Interventions : création, consultation et cycle de vie (cahier des charges, section 5.1).
 * Les transitions de statut sont décidées par cycle-de-vie.ts, appelé avant toute écriture.
 */
@Injectable()
export class InterventionsService {
  constructor(
    private readonly depot: InterventionsRepository,
    private readonly horloge: Horloge,
  ) {}

  /** US15 : liste filtrée, les plus urgentes puis les plus anciennes par défaut (RG18). */
  async lister(filtres: FiltresInterventions): Promise<PageApi<InterventionApi>> {
    const { interventions, total } = await this.depot.rechercher(filtres);
    const maintenant = this.horloge.maintenant();
    return paginer(
      interventions.map((intervention) => versInterventionApi(intervention, maintenant)),
      total,
      filtres,
    );
  }

  /**
   * US14 et US24. Un technicien ne voit que les interventions de ses tournées : l'existence est
   * vérifiée d'abord (404), puis l'affectation (403), comme pour les gestionnaires.
   */
  async consulter(idIntervention: number, lecteur: UtilisateurConnecte): Promise<InterventionApi> {
    const intervention = await this.trouver(idIntervention);
    if (lecteur.role === Role.TECHNICIEN && !estAffecteA(intervention, lecteur)) {
      throw new ForbiddenException('Cette intervention ne fait pas partie de vos tournées.');
    }
    return versInterventionApi(intervention, this.horloge.maintenant());
  }

  /** US14 et RG01 : l'intervention est créée « à planifier », par l'utilisateur connecté. */
  async creer(
    nouvelle: NouvelleIntervention,
    auteur: UtilisateurConnecte,
  ): Promise<InterventionApi> {
    const idIntervention = await this.depot.creerIntervention(async (operations) => {
      verifierAdresseUtilisable(await operations.verrouillerAdresse(nouvelle.adresseId));
      const dureeParDefaut = await operations.trouverDureeParDefaut(nouvelle.typeInterventionId);
      if (dureeParDefaut === null) {
        throw new BadRequestException('Type d’intervention inexistant.');
      }
      return operations.creer({
        idAdresse: nouvelle.adresseId,
        idTypeIntervention: nouvelle.typeInterventionId,
        idCreateur: auteur.id,
        description: nouvelle.description,
        urgence: nouvelle.urgence,
        dureeEstimeeMin: nouvelle.dureeEstimeeMin ?? dureeParDefaut,
      });
    });
    return versInterventionApi(await this.trouver(idIntervention), this.horloge.maintenant());
  }

  private async trouver(idIntervention: number): Promise<InterventionDetaillee> {
    const intervention = await this.depot.trouver(idIntervention);
    if (intervention === null) {
      throw new NotFoundException('Intervention introuvable.');
    }
    return intervention;
  }
}

/** Technicien de la tournée qui contient l'intervention (lien compte → fiche → tournée). */
function estAffecteA(
  intervention: InterventionDetaillee,
  utilisateur: UtilisateurConnecte,
): boolean {
  return intervention.tournee?.technicien.idUtilisateur === utilisateur.id;
}

/** Contrat d'API, POST /interventions : adresse existante et en service, d'un client actif. */
function verifierAdresseUtilisable(adresse: AdresseUtilisable | null): void {
  if (adresse === null) {
    throw new BadRequestException('Adresse inexistante.');
  }
  if (adresse.clientArchive) {
    throw new BadRequestException(
      'Ce client est archivé : on ne peut plus lui créer d’intervention.',
    );
  }
  if (adresse.adresseArchivee) {
    throw new BadRequestException(
      'Cette adresse est archivée : choisissez une adresse en service du client.',
    );
  }
}
