import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { jourMetier } from '../commun/fuseau-metier.js';
import { Horloge } from '../commun/horloge.js';
import { type PageApi, paginer } from '../commun/validation.js';
import { Role } from '../generated/prisma/client.ts';
import { choisirCouleur } from './regles-techniciens.js';
import { versTechnicienApi } from './techniciens.presentation.js';
import {
  type OperationsSurTechnicien,
  type TechnicienVerrouille,
  TechniciensRepository,
} from './techniciens.repository.js';
import type {
  FiltresTechniciens,
  ModificationTechnicien,
  NouveauTechnicien,
  TechnicienApi,
} from './techniciens.types.js';

/** Fiches des techniciens : US11, règles D02 et RG22. */
@Injectable()
export class TechniciensService {
  constructor(
    private readonly depot: TechniciensRepository,
    private readonly horloge: Horloge,
  ) {}

  async lister(filtres: FiltresTechniciens): Promise<PageApi<TechnicienApi>> {
    const { techniciens, total } = await this.depot.rechercher(filtres);
    return paginer(techniciens.map(versTechnicienApi), total, filtres);
  }

  /** La fiche d'un compte actif de rôle TECHNICIEN, une seule par compte (D02). */
  async creer(nouveau: NouveauTechnicien): Promise<TechnicienApi> {
    const compte = await this.depot.trouverCompte(nouveau.utilisateurId);
    if (compte === null) {
      throw new BadRequestException('Le compte utilisateur indiqué n’existe pas.');
    }
    if (!compte.actif) {
      throw new BadRequestException(
        'Ce compte utilisateur est désactivé : réactivez-le avant de créer sa fiche technicien.',
      );
    }
    if (compte.role !== Role.TECHNICIEN) {
      throw new BadRequestException(
        `Ce compte a le rôle ${compte.role} : seul un compte TECHNICIEN peut avoir une fiche technicien.`,
      );
    }
    if (compte.aDejaUneFiche) {
      throw new ConflictException('Ce compte a déjà une fiche technicien.');
    }
    const technicien = await this.depot.creer({
      idUtilisateur: compte.id,
      telephone: nouveau.telephone,
      couleurPlanning:
        nouveau.couleurPlanning ?? choisirCouleur(await this.depot.couleursEnService()),
    });
    if (technicien === null) {
      throw new ConflictException('Ce compte a déjà une fiche technicien.');
    }
    return versTechnicienApi(technicien);
  }

  /** Un technicien archivé reste consultable, pour l'historique. */
  async consulter(idTechnicien: number): Promise<TechnicienApi> {
    const technicien = await this.depot.trouver(idTechnicien);
    if (technicien === null) {
      throw new NotFoundException('Technicien introuvable.');
    }
    return versTechnicienApi(technicien);
  }

  async modifier(
    idTechnicien: number,
    modification: ModificationTechnicien,
  ): Promise<TechnicienApi> {
    await this.depot.modifierTechnicien(async (operations) => {
      await this.verrouillerTechnicienEnService(operations, idTechnicien);
      await operations.modifierTechnicien(idTechnicien, modification);
    });
    return this.consulter(idTechnicien);
  }

  /**
   * RG22 : le technicien sort du planning mais reste dans l'historique. Son compte n'est pas
   * désactivé : c'est une action distincte de l'administrateur.
   */
  async archiver(idTechnicien: number): Promise<TechnicienApi> {
    await this.depot.modifierTechnicien(async (operations) => {
      const technicien = await this.verrouillerTechnicien(operations, idTechnicien);
      if (technicien.archive) {
        throw new BadRequestException('Ce technicien est déjà archivé.');
      }
      const maintenant = this.horloge.maintenant();
      const aVenir = await operations.compterInterventionsAVenir(
        idTechnicien,
        jourMetier(maintenant),
      );
      if (aVenir > 0) {
        throw new ConflictException(
          'Impossible d’archiver ce technicien tant qu’il a des interventions en cours ou ' +
            `planifiées à partir d’aujourd’hui (${aVenir} actuellement) : ` +
            'retirez-les de ses tournées d’abord.',
        );
      }
      await operations.archiverTechnicien(idTechnicien, maintenant);
    });
    return this.consulter(idTechnicien);
  }

  private async verrouillerTechnicien(
    operations: OperationsSurTechnicien,
    idTechnicien: number,
  ): Promise<TechnicienVerrouille> {
    const technicien = await operations.verrouillerTechnicien(idTechnicien);
    if (technicien === null) {
      throw new NotFoundException('Technicien introuvable.');
    }
    return technicien;
  }

  private async verrouillerTechnicienEnService(
    operations: OperationsSurTechnicien,
    idTechnicien: number,
  ): Promise<TechnicienVerrouille> {
    const technicien = await this.verrouillerTechnicien(operations, idTechnicien);
    if (technicien.archive) {
      throw new BadRequestException(
        'Ce technicien est archivé : sa fiche ne peut plus être modifiée.',
      );
    }
    return technicien;
  }
}
