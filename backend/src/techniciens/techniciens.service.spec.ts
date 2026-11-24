import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Horloge } from '../commun/horloge.js';
import type {
  CompteARattacher,
  OperationsSurTechnicien,
  TechnicienAvecCompte,
  TechniciensRepository,
} from './techniciens.repository.js';
import { TechniciensService } from './techniciens.service.js';

// Mardi 8 décembre 2026, 1 h 30 à La Réunion, soit encore lundi 7 décembre en UTC : le jour
// métier est le 8.
const MAINTENANT = new Date('2026-12-08T01:30:00+04:00');

const TECHNICIEN: TechnicienAvecCompte = {
  id: 2,
  idUtilisateur: 7,
  telephone: '0692123456',
  couleurPlanning: '#1E88E5',
  archive: false,
  archiveLe: null,
  utilisateur: {
    nom: 'Benali',
    prenom: 'Karim',
    email: 'karim.benali@plomberie-durand.fr',
    actif: true,
  },
};

const COMPTE: CompteARattacher = { id: 7, role: 'TECHNICIEN', actif: true, aDejaUneFiche: false };

function creerService(
  verrouille: { id: number; archive: boolean } | null = { id: 2, archive: false },
) {
  const operations: OperationsSurTechnicien = {
    verrouillerTechnicien: vi.fn().mockResolvedValue(verrouille),
    compterInterventionsAVenir: vi.fn().mockResolvedValue(0),
    modifierTechnicien: vi.fn().mockResolvedValue(undefined),
    archiverTechnicien: vi.fn().mockResolvedValue(undefined),
  };
  const depot = {
    rechercher: vi.fn().mockResolvedValue({ techniciens: [TECHNICIEN], total: 1 }),
    trouver: vi.fn().mockResolvedValue(TECHNICIEN),
    trouverCompte: vi.fn().mockResolvedValue(COMPTE),
    couleursEnService: vi.fn().mockResolvedValue(['#0F766E']),
    creer: vi.fn().mockResolvedValue(TECHNICIEN),
    modifierTechnicien: vi.fn((travail: (ops: OperationsSurTechnicien) => Promise<unknown>) =>
      travail(operations),
    ),
  };
  const horloge = { maintenant: () => MAINTENANT } as Horloge;
  const service = new TechniciensService(depot as unknown as TechniciensRepository, horloge);
  return { service, depot, operations };
}

describe('TechniciensService', () => {
  it('met en forme la fiche avec les données du compte, sans le hash du mot de passe', async () => {
    const { service } = creerService();

    const page = await service.lister({ page: 1, limit: 20, archives: false, tri: 'nom' });

    expect(page.data[0]).toEqual({
      id: 2,
      utilisateurId: 7,
      nom: 'Benali',
      prenom: 'Karim',
      email: 'karim.benali@plomberie-durand.fr',
      compteActif: true,
      telephone: '0692123456',
      couleurPlanning: '#1E88E5',
      archive: false,
      archiveLe: null,
    });
  });

  it('répond 404 pour un technicien inexistant', async () => {
    const { service, depot } = creerService();
    depot.trouver.mockResolvedValue(null);

    await expect(service.consulter(99)).rejects.toThrow(NotFoundException);
  });

  describe('création', () => {
    it('prend une couleur libre de la palette quand aucune n’est fournie', async () => {
      const { service, depot } = creerService();

      await service.creer({ utilisateurId: 7, telephone: '0692123456' });

      expect(depot.creer).toHaveBeenCalledExactlyOnceWith({
        idUtilisateur: 7,
        telephone: '0692123456',
        couleurPlanning: '#1E88E5',
      });
    });

    it('garde la couleur choisie, sans lire celles des autres', async () => {
      const { service, depot } = creerService();

      await service.creer({
        utilisateurId: 7,
        telephone: '0692123456',
        couleurPlanning: '#123456',
      });

      expect(depot.couleursEnService).not.toHaveBeenCalled();
      expect(depot.creer).toHaveBeenCalledWith(
        expect.objectContaining({ couleurPlanning: '#123456' }),
      );
    });

    it.each([
      ['inexistant', null, 'Le compte utilisateur indiqué n’existe pas.'],
      ['désactivé', { ...COMPTE, actif: false }, 'Ce compte utilisateur est désactivé'],
      ['gestionnaire', { ...COMPTE, role: 'GESTIONNAIRE' }, 'Ce compte a le rôle GESTIONNAIRE'],
    ])('refuse 400 un compte %s, sans rien créer', async (_cas, compte, message) => {
      const { service, depot } = creerService();
      depot.trouverCompte.mockResolvedValue(compte);

      const creation = service.creer({ utilisateurId: 7, telephone: '0692123456' });

      await expect(creation).rejects.toThrow(BadRequestException);
      await expect(creation).rejects.toThrow(message);
      expect(depot.creer).not.toHaveBeenCalled();
    });

    it('refuse 409 une deuxième fiche pour le même compte (D02)', async () => {
      const { service, depot } = creerService();
      depot.trouverCompte.mockResolvedValue({ ...COMPTE, aDejaUneFiche: true });

      await expect(service.creer({ utilisateurId: 7, telephone: '0692123456' })).rejects.toThrow(
        ConflictException,
      );
      expect(depot.creer).not.toHaveBeenCalled();
    });

    it('refuse 409 quand la base tranche une création simultanée', async () => {
      const { service, depot } = creerService();
      depot.creer.mockResolvedValue(null);

      await expect(service.creer({ utilisateurId: 7, telephone: '0692123456' })).rejects.toThrow(
        'Ce compte a déjà une fiche technicien.',
      );
    });
  });

  describe('modification', () => {
    it('enregistre les champs envoyés', async () => {
      const { service, operations } = creerService();

      await service.modifier(2, { couleurPlanning: '#C62828' });

      expect(operations.modifierTechnicien).toHaveBeenCalledExactlyOnceWith(2, {
        couleurPlanning: '#C62828',
      });
    });

    it('refuse de modifier un technicien archivé', async () => {
      const { service, operations } = creerService({ id: 2, archive: true });

      await expect(service.modifier(2, { telephone: '0692000001' })).rejects.toThrow(
        BadRequestException,
      );
      expect(operations.modifierTechnicien).not.toHaveBeenCalled();
    });
  });

  describe('archivage', () => {
    it('cherche les interventions à partir du jour de La Réunion, pas du jour UTC, puis archive', async () => {
      const { service, operations } = creerService();

      await service.archiver(2);

      expect(operations.compterInterventionsAVenir).toHaveBeenCalledExactlyOnceWith(
        2,
        '2026-12-08',
      );
      expect(operations.archiverTechnicien).toHaveBeenCalledExactlyOnceWith(2, MAINTENANT);
    });

    it('refuse 409 tant que des interventions sont en cours ou à venir', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.compterInterventionsAVenir).mockResolvedValue(3);

      const archivage = service.archiver(2);

      await expect(archivage).rejects.toThrow(ConflictException);
      await expect(archivage).rejects.toThrow('(3 actuellement)');
      expect(operations.archiverTechnicien).not.toHaveBeenCalled();
    });

    it('refuse d’archiver deux fois, et répond 404 pour un technicien inexistant', async () => {
      await expect(creerService({ id: 2, archive: true }).service.archiver(2)).rejects.toThrow(
        'Ce technicien est déjà archivé.',
      );
      await expect(creerService(null).service.archiver(99)).rejects.toThrow(NotFoundException);
    });
  });
});
