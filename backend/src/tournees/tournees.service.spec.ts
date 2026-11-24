import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import type { Horloge } from '../commun/horloge.js';
import type { JournalDesActions } from '../journal/journal-des-actions.js';
import type {
  OperationsSurTournee,
  TourneeDetaillee,
  TourneesRepository,
} from './tournees.repository.js';
import { TourneesService } from './tournees.service.js';
import type { Auteur } from './tournees.types.js';

// Lundi 7 décembre 2026, 9 h à La Réunion.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const GESTIONNAIRE: Auteur = { id: 2, role: 'GESTIONNAIRE' };
const ID_TOURNEE = 1;

const TOURNEE_VIDE = {
  id: ID_TOURNEE,
  dateTournee: new Date('2026-12-08T00:00:00Z'),
  technicien: {
    id: 4,
    telephone: '0692000001',
    couleurPlanning: '#0F766E',
    utilisateur: { nom: 'Hoarau', prenom: 'Kévin' },
  },
  interventions: [],
} as unknown as TourneeDetaillee;

function creerOperations(): OperationsSurTournee {
  return {
    verrouillerTechnicienDeLaTournee: vi.fn().mockResolvedValue(4),
    verrouillerTournee: vi.fn().mockResolvedValue({
      id: ID_TOURNEE,
      dateTournee: new Date('2026-12-08T00:00:00Z'),
      idTechnicien: 4,
    }),
    verrouillerIntervention: vi.fn().mockResolvedValue({
      id: 30,
      statut: 'A_PLANIFIER',
      dureeEstimeeMin: 60,
      idTournee: null,
    }),
    listerRangs: vi.fn().mockResolvedValue([]),
    listerInterventionsDuTechnicien: vi.fn().mockResolvedValue([]),
    listerIndisponibilites: vi.fn().mockResolvedValue([]),
    planifier: vi.fn().mockResolvedValue(undefined),
    remettreAPlanifier: vi.fn().mockResolvedValue(undefined),
    decalerRangs: vi.fn().mockResolvedValue(undefined),
    enregistrerRangs: vi.fn().mockResolvedValue(undefined),
  };
}

function creerService() {
  const operations = creerOperations();
  const depot = {
    trouverTechnicien: vi.fn().mockResolvedValue({ id: 4, archive: false, actif: true }),
    trouverIdTechnicienDuCompte: vi.fn().mockResolvedValue(4),
    creerTournee: vi.fn().mockResolvedValue(ID_TOURNEE),
    trouverTournee: vi.fn().mockResolvedValue(TOURNEE_VIDE),
    trouverTourneeDuJour: vi.fn().mockResolvedValue(null),
    listerPlanning: vi.fn().mockResolvedValue([]),
    modifierTournee: vi.fn((travail: (o: OperationsSurTournee) => Promise<unknown>) =>
      travail(operations),
    ),
  };
  const journal = { enregistrer: vi.fn().mockResolvedValue(undefined) };
  const horloge = { maintenant: () => MAINTENANT } as Horloge;
  const service = new TourneesService(
    depot as unknown as TourneesRepository,
    horloge,
    journal as unknown as JournalDesActions,
  );
  return { service, depot, operations, journal };
}

const AFFECTATION_A_9H = {
  interventionId: 30,
  debutPrevu: new Date('2026-12-08T09:00:00+04:00'),
};

describe('TourneesService', () => {
  describe('création d’une tournée (US20)', () => {
    it('crée la tournée au nom du gestionnaire connecté et la renvoie', async () => {
      const { service, depot } = creerService();

      const tournee = await service.creerTournee(
        { technicienId: 4, dateTournee: '2026-12-08' },
        GESTIONNAIRE,
      );

      expect(depot.creerTournee).toHaveBeenCalledWith({
        idTechnicien: 4,
        dateTournee: '2026-12-08',
        idCreateur: GESTIONNAIRE.id,
      });
      expect(tournee).toMatchObject({ id: ID_TOURNEE, dateTournee: '2026-12-08' });
    });

    it('refuse un technicien inexistant', async () => {
      const { service, depot } = creerService();
      depot.trouverTechnicien.mockResolvedValue(null);

      const creation = service.creerTournee(
        { technicienId: 99, dateTournee: '2026-12-08' },
        GESTIONNAIRE,
      );

      await expect(creation).rejects.toThrow(BadRequestException);
    });

    it.each([
      ['archivé', { archive: true, actif: true }],
      ['dont le compte est désactivé', { archive: false, actif: false }],
    ])('refuse un technicien %s', async (_cas, etat) => {
      const { service, depot } = creerService();
      depot.trouverTechnicien.mockResolvedValue({ id: 4, ...etat });

      const creation = service.creerTournee(
        { technicienId: 4, dateTournee: '2026-12-08' },
        GESTIONNAIRE,
      );

      await expect(creation).rejects.toThrow(/archivé ou son compte est désactivé/);
      expect(depot.creerTournee).not.toHaveBeenCalled();
    });

    it('répond 409 quand le technicien a déjà une tournée ce jour-là (RG08)', async () => {
      const { service, depot } = creerService();
      depot.creerTournee.mockResolvedValue(null);

      const creation = service.creerTournee(
        { technicienId: 4, dateTournee: '2026-12-08' },
        GESTIONNAIRE,
      );

      await expect(creation).rejects.toThrow(ConflictException);
    });

    it('refuse une date passée sans interroger la base (RG12)', async () => {
      const { service, depot } = creerService();

      const creation = service.creerTournee(
        { technicienId: 4, dateTournee: '2026-12-04' },
        GESTIONNAIRE,
      );

      await expect(creation).rejects.toThrow(/date passée/);
      expect(depot.trouverTechnicien).not.toHaveBeenCalled();
    });
  });

  describe('affectation (US21)', () => {
    it('planifie l’intervention en dernier et journalise le changement de statut', async () => {
      const { service, operations, journal } = creerService();
      vi.mocked(operations.listerRangs).mockResolvedValue([
        { id: 20, statut: 'PLANIFIEE', ordreTournee: 1 },
      ]);

      await service.affecterIntervention(ID_TOURNEE, AFFECTATION_A_9H, GESTIONNAIRE);

      expect(operations.decalerRangs).toHaveBeenCalledWith(ID_TOURNEE, 2, 1);
      expect(operations.planifier).toHaveBeenCalledWith(30, {
        idTournee: ID_TOURNEE,
        debutPrevu: AFFECTATION_A_9H.debutPrevu,
        ordreTournee: 2,
      });
      expect(journal.enregistrer).toHaveBeenCalledWith({
        type: 'STATUT_MODIFIE',
        interventionId: 30,
        ancienStatut: 'A_PLANIFIER',
        nouveauStatut: 'PLANIFIEE',
        auteur: { id: GESTIONNAIRE.id, role: 'GESTIONNAIRE' },
      });
    });

    it('cherche les conflits sur le créneau calculé avec la durée estimée', async () => {
      const { service, operations } = creerService();

      await service.affecterIntervention(ID_TOURNEE, AFFECTATION_A_9H, GESTIONNAIRE);

      expect(operations.listerInterventionsDuTechnicien).toHaveBeenCalledWith(
        4,
        { debut: AFFECTATION_A_9H.debutPrevu, fin: new Date('2026-12-08T10:00:00+04:00') },
        30,
      );
    });

    it('n’écrit rien et ne journalise rien en cas de chevauchement (RG09)', async () => {
      const { service, operations, journal } = creerService();
      vi.mocked(operations.listerInterventionsDuTechnicien).mockResolvedValue([
        {
          id: 21,
          debut: new Date('2026-12-08T09:30:00+04:00'),
          fin: new Date('2026-12-08T10:30:00+04:00'),
        },
      ]);

      const affectation = service.affecterIntervention(ID_TOURNEE, AFFECTATION_A_9H, GESTIONNAIRE);

      await expect(affectation).rejects.toThrow(ConflictException);
      expect(operations.planifier).not.toHaveBeenCalled();
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });

    it('répond 409 pendant une indisponibilité (RG10)', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.listerIndisponibilites).mockResolvedValue([
        {
          debut: new Date('2026-12-08T07:00:00+04:00'),
          fin: new Date('2026-12-08T19:00:00+04:00'),
          motif: 'Formation',
        },
      ]);

      const affectation = service.affecterIntervention(ID_TOURNEE, AFFECTATION_A_9H, GESTIONNAIRE);

      await expect(affectation).rejects.toThrow(/indisponible.*Formation/);
    });

    it('répond 404 pour une tournée inexistante', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.verrouillerTournee).mockResolvedValue(null);

      const affectation = service.affecterIntervention(99, AFFECTATION_A_9H, GESTIONNAIRE);

      await expect(affectation).rejects.toThrow(NotFoundException);
    });

    it('verrouille le technicien avant la tournée, dans l’ordre de l’ajout d’une indisponibilité', async () => {
      const { service, operations } = creerService();

      await service.affecterIntervention(ID_TOURNEE, AFFECTATION_A_9H, GESTIONNAIRE);

      const technicien = vi.mocked(operations.verrouillerTechnicienDeLaTournee).mock
        .invocationCallOrder[0];
      const tournee = vi.mocked(operations.verrouillerTournee).mock.invocationCallOrder[0];
      expect(technicien).toBeLessThan(tournee);
    });

    it('répond 404 sans verrouiller la tournée quand elle n’existe pas', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.verrouillerTechnicienDeLaTournee).mockResolvedValue(null);

      await expect(
        service.affecterIntervention(99, AFFECTATION_A_9H, GESTIONNAIRE),
      ).rejects.toThrow('Tournée introuvable.');
      expect(operations.verrouillerTournee).not.toHaveBeenCalled();
    });

    it('refuse une intervention inexistante', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.verrouillerIntervention).mockResolvedValue(null);

      const affectation = service.affecterIntervention(ID_TOURNEE, AFFECTATION_A_9H, GESTIONNAIRE);

      await expect(affectation).rejects.toThrow('Intervention inexistante.');
    });

    it('refuse de planifier sur une tournée passée', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.verrouillerTournee).mockResolvedValue({
        id: ID_TOURNEE,
        dateTournee: new Date('2026-12-05T00:00:00Z'),
        idTechnicien: 4,
      });

      const affectation = service.affecterIntervention(ID_TOURNEE, AFFECTATION_A_9H, GESTIONNAIRE);

      await expect(affectation).rejects.toThrow(/tournée passée/);
    });

    it('garde la planification et trace l’échec si le journal des actions est indisponible', async () => {
      const { service, journal } = creerService();
      journal.enregistrer.mockRejectedValue(new Error('MongoDB injoignable'));
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const tournee = await service.affecterIntervention(
        ID_TOURNEE,
        AFFECTATION_A_9H,
        GESTIONNAIRE,
      );

      expect(tournee.id).toBe(ID_TOURNEE);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('STATUT_MODIFIE non enregistré pour l’intervention 30'),
        expect.stringContaining('MongoDB injoignable'),
      );
      log.mockRestore();
    });
  });

  describe('retrait (RG04)', () => {
    it('remet l’intervention à planifier et fait remonter les suivantes', async () => {
      const { service, operations, journal } = creerService();
      vi.mocked(operations.verrouillerIntervention).mockResolvedValue({
        id: 30,
        statut: 'PLANIFIEE',
        dureeEstimeeMin: 60,
        idTournee: ID_TOURNEE,
      });
      vi.mocked(operations.listerRangs).mockResolvedValue([
        { id: 20, statut: 'PLANIFIEE', ordreTournee: 1 },
        { id: 30, statut: 'PLANIFIEE', ordreTournee: 2 },
        { id: 40, statut: 'PLANIFIEE', ordreTournee: 3 },
      ]);

      await service.retirerIntervention(ID_TOURNEE, 30, GESTIONNAIRE);

      expect(operations.remettreAPlanifier).toHaveBeenCalledWith(30);
      expect(operations.decalerRangs).toHaveBeenCalledWith(ID_TOURNEE, 3, -1);
      expect(journal.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({ ancienStatut: 'PLANIFIEE', nouveauStatut: 'A_PLANIFIER' }),
      );
    });

    it('répond 404 pour une intervention d’une autre tournée', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.verrouillerIntervention).mockResolvedValue({
        id: 30,
        statut: 'PLANIFIEE',
        dureeEstimeeMin: 60,
        idTournee: 2,
      });

      const retrait = service.retirerIntervention(ID_TOURNEE, 30, GESTIONNAIRE);

      await expect(retrait).rejects.toThrow(NotFoundException);
      expect(operations.remettreAPlanifier).not.toHaveBeenCalled();
    });
  });

  describe('tournée du jour (US24)', () => {
    it('cherche la tournée du jour à La Réunion du technicien connecté', async () => {
      const { service, depot } = creerService();

      const tournee = await service.consulterTourneeDuJour({ id: 9, role: 'TECHNICIEN' });

      expect(depot.trouverIdTechnicienDuCompte).toHaveBeenCalledWith(9);
      expect(depot.trouverTourneeDuJour).toHaveBeenCalledWith(4, '2026-12-07');
      expect(tournee).toBeNull();
    });

    it('répond 404 pour un compte sans fiche technicien', async () => {
      const { service, depot } = creerService();
      depot.trouverIdTechnicienDuCompte.mockResolvedValue(null);

      await expect(service.consulterTourneeDuJour({ id: 9, role: 'TECHNICIEN' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('donne la semaine en cours à La Réunion, du lundi au samedi', () => {
    const { service } = creerService();

    expect(service.semaineEnCours()).toEqual({ du: '2026-12-07', au: '2026-12-12' });
  });
});
