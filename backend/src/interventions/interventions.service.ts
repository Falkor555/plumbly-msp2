import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UtilisateurConnecte } from '../commun/autorisation/utilisateur-connecte.js';
import { depuisColonneDate, jourMetier } from '../commun/fuseau-metier.js';
import { Horloge } from '../commun/horloge.js';
import { type PageApi, paginer } from '../commun/validation.js';
import { Role, type StatutIntervention } from '../generated/prisma/client.ts';
import { JournalDesActions } from '../journal/journal-des-actions.js';
import type { TourneeVerrouillee } from '../tournees/operations-verrouillees.js';
import {
  creneauDe,
  verifierAbsenceDeChevauchement,
  verifierDisponibilite,
  verifierHorairesOuvres,
} from '../tournees/regles-planification.js';
import {
  type ActionSurIntervention,
  statutApres,
  verifierCompteRenduModifiable,
  verifierModifiable,
} from './cycle-de-vie.js';
import type { InterventionDetaillee } from './intervention-detaillee.js';
import { versInterventionApi } from './interventions.presentation.js';
import {
  type AdresseUtilisable,
  type Affectation,
  type ChampsModifiables,
  type InterventionVerrouillee,
  InterventionsRepository,
  type OperationsSurIntervention,
} from './interventions.repository.js';
import type {
  Annulation,
  CompteRendu,
  FiltresInterventions,
  FinDIntervention,
  InterventionApi,
  ModificationIntervention,
  NouvelleIntervention,
} from './interventions.types.js';

interface ChangementDeStatut {
  ancienStatut: StatutIntervention;
  nouveauStatut: StatutIntervention;
}

const MODIFIEE_ENTRE_TEMPS = 'L’intervention a été modifiée entre-temps, rechargez la page.';

/**
 * Interventions : création, consultation et cycle de vie (cahier des charges, section 5.1).
 * Chaque transition passe par statutApres (cycle-de-vie.ts) avant toute écriture, et le journal
 * des actions (RG07) est écrit après la validation de la transaction, jamais dedans : une action
 * refusée ou annulée par un rollback n'y laisse aucune trace.
 */
@Injectable()
export class InterventionsService {
  constructor(
    private readonly depot: InterventionsRepository,
    private readonly horloge: Horloge,
    private readonly journal: JournalDesActions,
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
    return this.relire(idIntervention);
  }

  /**
   * US16, RG06 et RG15 : le statut, la tournée et le rang ne changent jamais ici. Une nouvelle
   * durée pour une intervention planifiée doit encore tenir dans son créneau (RG09 à RG11).
   */
  async modifier(
    idIntervention: number,
    modification: ModificationIntervention,
  ): Promise<InterventionApi> {
    await this.depot.modifierIntervention(async (operations) => {
      const { intervention, tournee } = await verrouillerAvecSaTournee(operations, idIntervention);
      verifierModifiable(intervention.statut, {
        changeAdresse: modification.adresseId !== undefined,
      });
      if (modification.adresseId !== undefined) {
        verifierAdresseUtilisable(await operations.verrouillerAdresse(modification.adresseId));
      }
      if (
        modification.typeInterventionId !== undefined &&
        (await operations.trouverDureeParDefaut(modification.typeInterventionId)) === null
      ) {
        throw new BadRequestException('Type d’intervention inexistant.');
      }
      if (modification.dureeEstimeeMin !== undefined && tournee !== null) {
        await verifierLeCreneau(operations, intervention, tournee, modification.dureeEstimeeMin);
      }
      await operations.modifier(intervention.id, versChampsModifiables(modification));
    });
    return this.relire(idIntervention);
  }

  /**
   * US16 et RG05 : une intervention planifiée ou en cours sort de sa tournée, et les suivantes
   * remontent d'un rang dans la même transaction (RG13, RG14).
   */
  async annuler(
    idIntervention: number,
    { motif }: Annulation,
    auteur: UtilisateurConnecte,
  ): Promise<InterventionApi> {
    const ancienStatut = await this.depot.modifierIntervention(async (operations) => {
      const { intervention } = await verrouillerAvecSaTournee(operations, idIntervention);
      statutApres(intervention.statut, 'annuler');
      await operations.annuler(intervention.id, { motif, le: this.horloge.maintenant() });
      if (intervention.idTournee !== null && intervention.ordreTournee !== null) {
        await operations.decalerRangs(intervention.idTournee, intervention.ordreTournee + 1, -1);
      }
      return intervention.statut;
    });
    await this.journal.enregistrer({
      type: 'INTERVENTION_ANNULEE',
      auteur: { id: auteur.id, role: auteur.role },
      interventionId: idIntervention,
      ancienStatut,
      motif,
    });
    return this.relire(idIntervention);
  }

  /** US17, RG03 et RG24 : le technicien de la tournée démarre, le jour de la tournée. */
  async demarrer(idIntervention: number, auteur: UtilisateurConnecte): Promise<InterventionApi> {
    return this.changerStatutSurLeTerrain(
      idIntervention,
      'demarrer',
      auteur,
      (operations, etat) => {
        verifierJourDeLaTournee(etat.affectation, this.horloge.maintenant());
        return operations.demarrer(idIntervention, this.horloge.maintenant());
      },
    );
  }

  /** US17, US18 et RG03 : le technicien de la tournée termine, avec un compte rendu facultatif. */
  async terminer(
    idIntervention: number,
    { compteRendu }: FinDIntervention,
    auteur: UtilisateurConnecte,
  ): Promise<InterventionApi> {
    return this.changerStatutSurLeTerrain(idIntervention, 'terminer', auteur, (operations) =>
      operations.terminer(idIntervention, { le: this.horloge.maintenant(), compteRendu }),
    );
  }

  /** US18 : seule modification permise après « terminée » ; le texte remplace le précédent. */
  async completerCompteRendu(
    idIntervention: number,
    { compteRendu }: CompteRendu,
    auteur: UtilisateurConnecte,
  ): Promise<InterventionApi> {
    await this.depot.modifierIntervention(async (operations) => {
      const intervention = await verrouillerSeule(operations, idIntervention);
      await verifierTechnicienAffecte(operations, intervention, auteur);
      verifierCompteRenduModifiable(intervention.statut);
      await operations.enregistrerCompteRendu(intervention.id, compteRendu);
    });
    return this.relire(idIntervention);
  }

  /**
   * Démarrer ou terminer. Seule l'intervention est verrouillée : sa tournée ne change que par un
   * retrait ou une annulation, qui verrouillent aussi l'intervention. Avec un seul verrou, aucun
   * interblocage n'est possible avec l'ordre technicien → tournée → intervention des autres.
   * Ordre des refus : 404, puis 403 (pas le technicien de la tournée), puis 400 (transition).
   */
  private async changerStatutSurLeTerrain(
    idIntervention: number,
    action: Extract<ActionSurIntervention, 'demarrer' | 'terminer'>,
    auteur: UtilisateurConnecte,
    ecrire: (
      operations: OperationsSurIntervention,
      etat: { affectation: Affectation | null },
    ) => Promise<void>,
  ): Promise<InterventionApi> {
    const changement = await this.depot.modifierIntervention(
      async (operations): Promise<ChangementDeStatut> => {
        const intervention = await verrouillerSeule(operations, idIntervention);
        const affectation = await verifierTechnicienAffecte(operations, intervention, auteur);
        const nouveauStatut = statutApres(intervention.statut, action);
        await ecrire(operations, { affectation });
        return { ancienStatut: intervention.statut, nouveauStatut };
      },
    );
    await this.journal.enregistrer({
      type: 'STATUT_MODIFIE',
      auteur: { id: auteur.id, role: auteur.role },
      interventionId: idIntervention,
      ...changement,
    });
    return this.relire(idIntervention);
  }

  private async relire(idIntervention: number): Promise<InterventionApi> {
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

/**
 * Verrouille l'intervention et, si elle est planifiée, son technicien et sa tournée, dans l'ordre
 * de l'affectation (technicien → tournée → intervention) pour ne pas créer d'interblocage.
 * La tournée est lue sans verrou pour savoir quoi verrouiller : si elle a changé entre la lecture
 * et le verrou, la modification est refusée plutôt que faite sur un planning périmé.
 */
async function verrouillerAvecSaTournee(
  operations: OperationsSurIntervention,
  idIntervention: number,
): Promise<{ intervention: InterventionVerrouillee; tournee: TourneeVerrouillee | null }> {
  const idTournee = await operations.lireIdTournee(idIntervention);
  if (idTournee === undefined) {
    throw new NotFoundException('Intervention introuvable.');
  }
  let tournee: TourneeVerrouillee | null = null;
  if (idTournee !== null) {
    await operations.verrouillerTechnicienDeLaTournee(idTournee);
    tournee = await operations.verrouillerTournee(idTournee);
  }
  const intervention = await operations.verrouillerIntervention(idIntervention);
  if (intervention === null || intervention.idTournee !== idTournee) {
    throw new ConflictException(MODIFIEE_ENTRE_TEMPS);
  }
  return { intervention, tournee };
}

async function verrouillerSeule(
  operations: OperationsSurIntervention,
  idIntervention: number,
): Promise<InterventionVerrouillee> {
  const intervention = await operations.verrouillerIntervention(idIntervention);
  if (intervention === null) {
    throw new NotFoundException('Intervention introuvable.');
  }
  return intervention;
}

/**
 * RG03 : seul le technicien de la tournée qui contient l'intervention change son statut. Une
 * intervention hors tournée (à planifier, annulée) n'a pas de technicien : c'est alors la
 * transition qui est refusée (400), pas l'accès.
 */
async function verifierTechnicienAffecte(
  operations: OperationsSurIntervention,
  intervention: InterventionVerrouillee,
  auteur: UtilisateurConnecte,
): Promise<Affectation | null> {
  if (intervention.idTournee === null) {
    return null;
  }
  const affectation = await operations.lireAffectation(intervention.idTournee);
  if (affectation.idCompteDuTechnicien !== auteur.id) {
    throw new ForbiddenException(
      'Seul le technicien de la tournée peut changer le statut de cette intervention.',
    );
  }
  return affectation;
}

/** RG24 : une intervention se démarre le jour de sa tournée, à l'heure de La Réunion. */
function verifierJourDeLaTournee(affectation: Affectation | null, maintenant: Date): void {
  const dateTournee = affectation === null ? null : depuisColonneDate(affectation.dateTournee);
  if (dateTournee !== jourMetier(maintenant)) {
    throw new BadRequestException(
      `Cette intervention est prévue le ${dateTournee} : elle ne peut être démarrée que ce jour-là.`,
    );
  }
}

/** RG09 à RG11 : la nouvelle durée garde le créneau dans les horaires, libre et disponible. */
async function verifierLeCreneau(
  operations: OperationsSurIntervention,
  intervention: InterventionVerrouillee,
  tournee: TourneeVerrouillee,
  dureeEstimeeMin: number,
): Promise<void> {
  // La contrainte intervention_planifiee_dans_tournee garantit un début à toute intervention planifiée.
  const creneau = creneauDe(intervention.debutPrevu as Date, dureeEstimeeMin);
  verifierHorairesOuvres(creneau, depuisColonneDate(tournee.dateTournee));
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
      'Ce client est archivé : on ne peut plus lui rattacher d’intervention.',
    );
  }
  if (adresse.adresseArchivee) {
    throw new BadRequestException(
      'Cette adresse est archivée : choisissez une adresse en service du client.',
    );
  }
}

function versChampsModifiables(modification: ModificationIntervention): ChampsModifiables {
  const { adresseId, typeInterventionId, ...autres } = modification;
  return {
    ...autres,
    ...(adresseId === undefined ? {} : { idAdresse: adresseId }),
    ...(typeInterventionId === undefined ? {} : { idTypeIntervention: typeInterventionId }),
  };
}
