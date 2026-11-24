import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ajouterJours, debutDuJourMetier, jourMetier } from '../commun/fuseau-metier.js';
import { Horloge } from '../commun/horloge.js';
import { type PageApi, paginer } from '../commun/validation.js';
import { Role } from '../generated/prisma/client.ts';
import type { IndisponibiliteApi } from '../tournees/tournees.types.js';
import {
  choisirCouleur,
  verifierAucuneIndisponibiliteRecouverte,
  verifierAucuneInterventionRecouverte,
} from './regles-techniciens.js';
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
  NouvelleIndisponibilite,
  PeriodeIndisponibilites,
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

  /**
   * US12 : sans période, les indisponibilités en cours et à venir. Les jours sont ceux de
   * La Réunion : « au » inclut toute la journée.
   */
  async listerIndisponibilites(
    idTechnicien: number,
    { du, au }: PeriodeIndisponibilites,
  ): Promise<IndisponibiliteApi[]> {
    if (!(await this.depot.existe(idTechnicien))) {
      throw new NotFoundException('Technicien introuvable.');
    }
    return this.depot.listerIndisponibilites(idTechnicien, {
      finApres: this.finApres(du, au),
      debutAvant: au === undefined ? undefined : debutDuJourMetier(ajouterJours(au, 1)),
    });
  }

  /** Depuis minuit le jour « du » ; sans aucune borne, depuis maintenant. */
  private finApres(du: string | undefined, au: string | undefined): Date | undefined {
    if (du !== undefined) {
      return debutDuJourMetier(du);
    }
    return au === undefined ? this.horloge.maintenant() : undefined;
  }

  /**
   * US12 et RG10 : la période ne recouvre ni une intervention planifiée ou en cours, ni une
   * autre indisponibilité. La ligne du technicien est verrouillée d'abord, comme dans
   * l'affectation d'une intervention (tournees.service.ts) : deux ajouts, ou un ajout et une
   * affectation, passent l'un après l'autre et ne peuvent pas se recouvrir.
   */
  ajouterIndisponibilite(
    idTechnicien: number,
    nouvelle: NouvelleIndisponibilite,
  ): Promise<IndisponibiliteApi> {
    return this.depot.modifierTechnicien(async (operations) => {
      const technicien = await this.verrouillerTechnicien(operations, idTechnicien);
      if (technicien.archive) {
        throw new BadRequestException(
          'Ce technicien est archivé : on ne peut plus lui ajouter d’indisponibilité.',
        );
      }
      verifierAucuneInterventionRecouverte(
        await operations.listerInterventionsQuiRecouvrent(idTechnicien, nouvelle),
      );
      verifierAucuneIndisponibiliteRecouverte(
        await operations.listerIndisponibilitesQuiRecouvrent(idTechnicien, nouvelle),
      );
      return operations.creerIndisponibilite(idTechnicien, nouvelle);
    });
  }

  /** US12 : une indisponibilité terminée reste dans l'historique. */
  async supprimerIndisponibilite(idTechnicien: number, idIndisponibilite: number): Promise<void> {
    await this.depot.modifierTechnicien(async (operations) => {
      await this.verrouillerTechnicien(operations, idTechnicien);
      const indisponibilite = await operations.trouverIndisponibilite(idIndisponibilite);
      if (indisponibilite === null || indisponibilite.idTechnicien !== idTechnicien) {
        throw new NotFoundException('Indisponibilité introuvable pour ce technicien.');
      }
      if (indisponibilite.fin <= this.horloge.maintenant()) {
        throw new BadRequestException(
          'Cette indisponibilité est terminée : elle est conservée dans l’historique.',
        );
      }
      await operations.supprimerIndisponibilite(idIndisponibilite);
    });
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
