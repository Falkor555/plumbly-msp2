import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { UtilisateurConnecte } from '../commun/autorisation/utilisateur-connecte.js';
import type { Horloge } from '../commun/horloge.js';
import type { InterventionDetaillee } from './intervention-detaillee.js';
import type {
  AdresseUtilisable,
  InterventionsRepository,
  OperationsDeCreation,
} from './interventions.repository.js';
import { InterventionsService } from './interventions.service.js';

// Lundi 7 décembre 2026, 9 h à La Réunion.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');

const GESTIONNAIRE: UtilisateurConnecte = { id: 3, role: 'GESTIONNAIRE' };
const KEVIN: UtilisateurConnecte = { id: 7, role: 'TECHNICIEN' };
const MATHIEU: UtilisateurConnecte = { id: 8, role: 'TECHNICIEN' };

const NOUVELLE = {
  adresseId: 15,
  typeInterventionId: 1,
  description: 'Fuite sous l’évier',
  urgence: 'NORMALE' as const,
};

/** Intervention telle que Prisma la renvoie, dans la tournée de Kévin (compte 7) si planifiée. */
function interventionDetaillee(
  statut: InterventionDetaillee['statut'] = 'A_PLANIFIER',
): InterventionDetaillee {
  const planifiee = statut !== 'A_PLANIFIER' && statut !== 'ANNULEE';
  return {
    id: 42,
    description: 'Fuite',
    urgence: 'NORMALE',
    statut,
    dureeEstimeeMin: 60,
    debutPrevu: planifiee ? new Date('2026-12-07T10:00:00+04:00') : null,
    finPrevue: planifiee ? new Date('2026-12-07T11:00:00+04:00') : null,
    ordreTournee: planifiee ? 1 : null,
    compteRendu: null,
    motifAnnulation: null,
    demarreeLe: null,
    termineeLe: null,
    annuleeLe: null,
    creeLe: MAINTENANT,
    majLe: MAINTENANT,
    idAdresse: 15,
    idTypeIntervention: 1,
    idCreateur: 3,
    idTournee: planifiee ? 5 : null,
    typeIntervention: { id: 1, libelle: 'Fuite', dureeDefautMin: 60 },
    adresse: {
      id: 15,
      rue: '1 rue de Paris',
      complement: null,
      codePostal: '97400',
      ville: 'Saint-Denis',
      infosAcces: null,
      archive: false,
      archiveLe: null,
      idClient: 8,
      client: {
        id: 8,
        typeClient: 'PARTICULIER',
        nomClient: 'Grondin',
        prenomClient: 'Hélène',
        raisonSociale: null,
        telephone: '0262000000',
        emailClient: null,
        archive: false,
        archiveLe: null,
        creeLe: MAINTENANT,
        majLe: MAINTENANT,
      },
    },
    createur: { id: 3, nom: 'Payet', prenom: 'Céline' },
    tournee: planifiee
      ? {
          id: 5,
          dateTournee: new Date('2026-12-07T00:00:00Z'),
          creeLe: MAINTENANT,
          idTechnicien: 2,
          idCreateur: 3,
          technicien: {
            id: 2,
            telephone: '0692000001',
            couleurPlanning: '#0F766E',
            archive: false,
            archiveLe: null,
            idUtilisateur: KEVIN.id,
            utilisateur: { nom: 'Hoarau', prenom: 'Kévin' },
          },
        }
      : null,
  };
}

function creerService({
  adresse = { adresseArchivee: false, clientArchive: false },
  dureeParDefaut = 45,
  intervention = interventionDetaillee(),
}: {
  adresse?: AdresseUtilisable | null;
  dureeParDefaut?: number | null;
  intervention?: InterventionDetaillee | null;
} = {}) {
  const creation: OperationsDeCreation = {
    verrouillerAdresse: vi.fn().mockResolvedValue(adresse),
    trouverDureeParDefaut: vi.fn().mockResolvedValue(dureeParDefaut),
    creer: vi.fn().mockResolvedValue(42),
  };
  const depot = {
    rechercher: vi.fn().mockResolvedValue({ interventions: [], total: 0 }),
    trouver: vi.fn().mockResolvedValue(intervention),
    creerIntervention: vi.fn((travail: (operations: OperationsDeCreation) => Promise<number>) =>
      travail(creation),
    ),
  };
  const horloge = { maintenant: () => MAINTENANT } as Horloge;
  const service = new InterventionsService(depot as unknown as InterventionsRepository, horloge);
  return { service, depot, creation };
}

describe('InterventionsService : lecture et création', () => {
  describe('creer (US14, RG01)', () => {
    it('reprend la durée par défaut du type quand aucune durée n’est envoyée', async () => {
      const { service, creation } = creerService({ dureeParDefaut: 45 });

      await service.creer(NOUVELLE, GESTIONNAIRE);

      expect(creation.creer).toHaveBeenCalledWith({
        idAdresse: 15,
        idTypeIntervention: 1,
        idCreateur: GESTIONNAIRE.id,
        description: 'Fuite sous l’évier',
        urgence: 'NORMALE',
        dureeEstimeeMin: 45,
      });
    });

    it('garde la durée envoyée plutôt que celle du type', async () => {
      const { service, creation } = creerService({ dureeParDefaut: 45 });

      await service.creer({ ...NOUVELLE, dureeEstimeeMin: 90 }, GESTIONNAIRE);

      expect(creation.creer).toHaveBeenCalledWith(expect.objectContaining({ dureeEstimeeMin: 90 }));
    });

    it('renvoie l’intervention créée, à planifier', async () => {
      const { service } = creerService();

      const creee = await service.creer(NOUVELLE, GESTIONNAIRE);

      expect(creee).toMatchObject({ id: 42, statut: 'A_PLANIFIER', tournee: null });
    });

    it.each<[string, AdresseUtilisable | null, string]>([
      ['inexistante', null, 'Adresse inexistante.'],
      [
        'archivée',
        { adresseArchivee: true, clientArchive: false },
        'Cette adresse est archivée : choisissez une adresse en service du client.',
      ],
      [
        'd’un client archivé',
        { adresseArchivee: false, clientArchive: true },
        'Ce client est archivé : on ne peut plus lui créer d’intervention.',
      ],
    ])('refuse en 400 une adresse %s, sans rien créer', async (_cas, adresse, message) => {
      const { service, creation } = creerService({ adresse });

      await expect(service.creer(NOUVELLE, GESTIONNAIRE)).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(creation.creer).not.toHaveBeenCalled();
    });

    it('refuse en 400 un type inexistant, sans rien créer', async () => {
      const { service, creation } = creerService({ dureeParDefaut: null });

      await expect(service.creer(NOUVELLE, GESTIONNAIRE)).rejects.toThrow(
        new BadRequestException('Type d’intervention inexistant.'),
      );
      expect(creation.creer).not.toHaveBeenCalled();
    });

    it('verrouille l’adresse avant de créer', async () => {
      const { service, creation } = creerService();

      await service.creer(NOUVELLE, GESTIONNAIRE);

      expect(vi.mocked(creation.verrouillerAdresse).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(creation.creer).mock.invocationCallOrder[0],
      );
    });
  });

  describe('consulter (US14, US24)', () => {
    it('répond 404 pour une intervention inexistante', async () => {
      const { service } = creerService({ intervention: null });

      await expect(service.consulter(99, GESTIONNAIRE)).rejects.toThrow(NotFoundException);
    });

    it('montre toute intervention à un gestionnaire', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('A_PLANIFIER') });

      await expect(service.consulter(42, GESTIONNAIRE)).resolves.toMatchObject({ id: 42 });
    });

    it('montre au technicien une intervention de sa tournée', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('PLANIFIEE') });

      await expect(service.consulter(42, KEVIN)).resolves.toMatchObject({
        tournee: { technicien: { nom: 'Hoarau' } },
      });
    });

    it('répond 403 au technicien pour l’intervention d’un collègue', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('PLANIFIEE') });

      await expect(service.consulter(42, MATHIEU)).rejects.toThrow(ForbiddenException);
    });

    it('répond 403 au technicien pour une intervention à planifier', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('A_PLANIFIER') });

      await expect(service.consulter(42, KEVIN)).rejects.toThrow(ForbiddenException);
    });

    it('répond 404 au technicien avant de vérifier l’affectation', async () => {
      const { service } = creerService({ intervention: null });

      await expect(service.consulter(99, KEVIN)).rejects.toThrow(NotFoundException);
    });
  });

  it('pagine la liste selon le contrat { data, meta }', async () => {
    const { service, depot } = creerService();
    depot.rechercher.mockResolvedValue({ interventions: [interventionDetaillee()], total: 41 });

    const page = await service.lister({ page: 2, limit: 20, tri: '-urgence' });

    expect(page.meta).toEqual({ page: 2, limit: 20, total: 41, totalPages: 3 });
    expect(page.data).toHaveLength(1);
  });
});
