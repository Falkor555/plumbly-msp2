import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { depuisColonneDate, jourMetier } from '../commun/fuseau-metier.js';
import { Horloge } from '../commun/horloge.js';
import { StatutIntervention } from '../generated/prisma/client.ts';
import { JournalDesActions } from '../journal/journal-des-actions.js';
import {
  creneauDe,
  nouveauxRangs,
  rangDInsertion,
  semaineDe,
  verifierAbsenceDeChevauchement,
  verifierAffectable,
  verifierDateDeTournee,
  verifierDisponibilite,
  verifierHorairesOuvres,
  verifierRetirable,
} from './regles-planification.js';
import { versPlanningApi, versTourneeApi } from './tournees.presentation.js';
import {
  type OperationsSurTournee,
  type TourneeVerrouillee,
  TourneesRepository,
} from './tournees.repository.js';
import type {
  Affectation,
  Auteur,
  FiltresPlanning,
  NouvelleTournee,
  NouvelOrdre,
  PlanningApi,
  TourneeApi,
} from './tournees.types.js';

interface ChangementDeStatut {
  interventionId: number;
  ancienStatut: StatutIntervention;
  nouveauStatut: StatutIntervention;
}

/** Planification des tournées : règles RG02, RG04 et RG08 à RG16 du cahier des charges. */
@Injectable()
export class TourneesService {
  private readonly logger = new Logger(TourneesService.name);

  constructor(
    private readonly depot: TourneesRepository,
    private readonly horloge: Horloge,
    private readonly journal: JournalDesActions,
  ) {}

  /** US20 : une tournée par technicien actif et par jour ouvré, aujourd'hui ou plus tard. */
  async creerTournee(nouvelle: NouvelleTournee, auteur: Auteur): Promise<TourneeApi> {
    verifierDateDeTournee(nouvelle.dateTournee, this.horloge.maintenant());
    const technicien = await this.depot.trouverTechnicien(nouvelle.technicienId);
    if (technicien === null) {
      throw new BadRequestException('Technicien inexistant.');
    }
    if (technicien.archive || !technicien.actif) {
      throw new BadRequestException('Le technicien est archivé ou son compte est désactivé.');
    }
    const idTournee = await this.depot.creerTournee({
      idTechnicien: technicien.id,
      dateTournee: nouvelle.dateTournee,
      idCreateur: auteur.id,
    });
    if (idTournee === null) {
      throw new ConflictException(`Le technicien a déjà une tournée le ${nouvelle.dateTournee}.`);
    }
    return this.consulterTournee(idTournee);
  }

  async consulterTournee(idTournee: number): Promise<TourneeApi> {
    const tournee = await this.depot.trouverTournee(idTournee);
    if (tournee === null) {
      throw new NotFoundException('Tournée introuvable.');
    }
    return versTourneeApi(tournee, this.horloge.maintenant());
  }

  /** US24 : la tournée du jour du technicien connecté, null s'il n'en a pas aujourd'hui. */
  async consulterTourneeDuJour(auteur: Auteur): Promise<TourneeApi | null> {
    const idTechnicien = await this.depot.trouverIdTechnicienDuCompte(auteur.id);
    if (idTechnicien === null) {
      throw new NotFoundException('Aucune fiche technicien n’est liée à ce compte.');
    }
    const maintenant = this.horloge.maintenant();
    const tournee = await this.depot.trouverTourneeDuJour(idTechnicien, jourMetier(maintenant));
    return tournee === null ? null : versTourneeApi(tournee, maintenant);
  }

  /** US23 : planning de la période, ou de la semaine en cours à La Réunion. */
  async consulterPlanning(filtres: FiltresPlanning): Promise<PlanningApi> {
    const techniciens = await this.depot.listerPlanning(
      filtres.du,
      filtres.au,
      filtres.technicienId,
    );
    return versPlanningApi(
      { du: filtres.du, au: filtres.au },
      techniciens,
      this.horloge.maintenant(),
    );
  }

  semaineEnCours(): { du: string; au: string } {
    return semaineDe(jourMetier(this.horloge.maintenant()));
  }

  /** US21 : affecter une intervention à une tournée, sur un créneau libre (RG02, RG09 à RG11). */
  async affecterIntervention(
    idTournee: number,
    affectation: Affectation,
    auteur: Auteur,
  ): Promise<TourneeApi> {
    const changement = await this.depot.modifierTournee(async (operations) => {
      // RG10 : le technicien est verrouillé en premier, dans le même ordre que l'ajout d'une
      // indisponibilité (techniciens.service.ts). Une affectation et une indisponibilité
      // simultanées passent l'une après l'autre, et la seconde voit la première.
      if ((await operations.verrouillerTechnicienDeLaTournee(idTournee)) === null) {
        throw new NotFoundException('Tournée introuvable.');
      }
      const tournee = await this.verrouillerTournee(operations, idTournee);
      const dateTournee = depuisColonneDate(tournee.dateTournee);
      if (dateTournee < jourMetier(this.horloge.maintenant())) {
        throw new BadRequestException('Impossible de planifier sur une tournée passée.');
      }
      const intervention = await operations.verrouillerIntervention(affectation.interventionId);
      if (intervention === null) {
        throw new BadRequestException('Intervention inexistante.');
      }
      verifierAffectable(intervention.statut);

      const creneau = creneauDe(affectation.debutPrevu, intervention.dureeEstimeeMin);
      verifierHorairesOuvres(creneau, dateTournee);
      verifierAbsenceDeChevauchement(
        creneau,
        await operations.listerInterventionsDuTechnicien(
          tournee.idTechnicien,
          creneau,
          intervention.id,
        ),
      );
      verifierDisponibilite(
        creneau,
        await operations.listerIndisponibilites(tournee.idTechnicien, creneau),
      );

      const rang = rangDInsertion(
        await operations.listerRangs(tournee.id),
        affectation.ordreTournee,
      );
      await operations.decalerRangs(tournee.id, rang, 1);
      await operations.planifier(intervention.id, {
        idTournee: tournee.id,
        debutPrevu: affectation.debutPrevu,
        ordreTournee: rang,
      });
      return {
        interventionId: intervention.id,
        ancienStatut: intervention.statut,
        nouveauStatut: StatutIntervention.PLANIFIEE,
      };
    });
    await this.journaliser(changement, auteur);
    return this.consulterTournee(idTournee);
  }

  /** RG04 : l'intervention retirée revient « à planifier » ; les suivantes remontent d'un rang. */
  async retirerIntervention(
    idTournee: number,
    idIntervention: number,
    auteur: Auteur,
  ): Promise<TourneeApi> {
    const changement = await this.depot.modifierTournee(async (operations) => {
      const tournee = await this.verrouillerTournee(operations, idTournee);
      const intervention = await operations.verrouillerIntervention(idIntervention);
      if (intervention === null || intervention.idTournee !== tournee.id) {
        throw new NotFoundException('Cette intervention n’est pas dans la tournée.');
      }
      verifierRetirable(intervention.statut);
      const rangs = await operations.listerRangs(tournee.id);
      const rangRetire = rangs.find((rang) => rang.id === intervention.id)?.ordreTournee;
      await operations.remettreAPlanifier(intervention.id);
      if (rangRetire !== undefined) {
        await operations.decalerRangs(tournee.id, rangRetire + 1, -1);
      }
      return {
        interventionId: intervention.id,
        ancienStatut: intervention.statut,
        nouveauStatut: StatutIntervention.A_PLANIFIER,
      };
    });
    await this.journaliser(changement, auteur);
    return this.consulterTournee(idTournee);
  }

  /** US22 : nouvel ordre complet, appliqué dans une seule transaction (RG13 à RG16). */
  async reordonner(idTournee: number, nouvelOrdre: NouvelOrdre): Promise<TourneeApi> {
    await this.depot.modifierTournee(async (operations) => {
      const tournee = await this.verrouillerTournee(operations, idTournee);
      const rangs = nouveauxRangs(
        await operations.listerRangs(tournee.id),
        nouvelOrdre.interventionIds,
      );
      await operations.enregistrerRangs(rangs);
    });
    return this.consulterTournee(idTournee);
  }

  private async verrouillerTournee(
    operations: OperationsSurTournee,
    idTournee: number,
  ): Promise<TourneeVerrouillee> {
    const tournee = await operations.verrouillerTournee(idTournee);
    if (tournee === null) {
      throw new NotFoundException('Tournée introuvable.');
    }
    return tournee;
  }

  /**
   * RG07, écrit après la validation de la transaction : la planification est enregistrée même
   * si le journal est indisponible, et l'échec est tracé pour être rattrapé.
   */
  private async journaliser(changement: ChangementDeStatut, auteur: Auteur): Promise<void> {
    try {
      await this.journal.enregistrer({
        type: 'STATUT_MODIFIE',
        ...changement,
        auteurId: auteur.id,
        date: this.horloge.maintenant(),
      });
    } catch (erreur) {
      this.logger.error(
        `Journal des actions indisponible : STATUT_MODIFIE non enregistré pour l’intervention ${changement.interventionId}`,
        erreur instanceof Error ? erreur.stack : String(erreur),
      );
    }
  }
}
