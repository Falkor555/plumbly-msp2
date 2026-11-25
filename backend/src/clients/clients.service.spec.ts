import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Horloge } from '../commun/horloge.js';
import type { JournalDesActions } from '../journal/journal-des-actions.js';
import type {
  ClientAvecAdresses,
  ClientsRepository,
  ClientVerrouille,
  OperationsSurClient,
} from './clients.repository.js';
import { ClientsService } from './clients.service.js';
import type { CriteresClients, NouveauClient } from './clients.types.js';

const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const CREE_LE = new Date('2026-11-20T06:00:00Z');

const ADRESSE = {
  id: 15,
  rue: '12 rue des Lilas',
  complement: null,
  codePostal: '97400',
  ville: 'Saint-Denis',
  infosAcces: null,
  archive: false,
  archiveLe: null,
  idClient: 8,
};

const CLIENT: ClientAvecAdresses = {
  id: 8,
  typeClient: 'PARTICULIER',
  nomClient: 'Payet',
  prenomClient: 'Hélène',
  raisonSociale: null,
  telephone: '0692123456',
  emailClient: null,
  archive: false,
  archiveLe: null,
  creeLe: CREE_LE,
  majLe: CREE_LE,
  adresses: [ADRESSE],
};

const VERROUILLE: ClientVerrouille = {
  id: 8,
  typeClient: 'PARTICULIER',
  nomClient: 'Payet',
  raisonSociale: null,
  archive: false,
};

function creerService(client: ClientVerrouille | null = VERROUILLE) {
  const operations: OperationsSurClient = {
    verrouillerClient: vi.fn().mockResolvedValue(client),
    compterInterventionsActivesDuClient: vi.fn().mockResolvedValue(0),
    modifierClient: vi.fn().mockResolvedValue(undefined),
    archiverClient: vi.fn().mockResolvedValue(undefined),
    trouverAdresse: vi.fn().mockResolvedValue({ id: 15, idClient: 8, archive: false }),
    compterAdressesActives: vi.fn().mockResolvedValue(2),
    compterInterventionsActivesDeLAdresse: vi.fn().mockResolvedValue(0),
    ajouterAdresse: vi.fn().mockResolvedValue(ADRESSE),
    modifierAdresse: vi.fn().mockResolvedValue(ADRESSE),
    archiverAdresse: vi
      .fn()
      .mockResolvedValue({ ...ADRESSE, archive: true, archiveLe: MAINTENANT }),
  };
  const depot = {
    rechercher: vi.fn().mockResolvedValue({ clients: [CLIENT], total: 41 }),
    trouver: vi.fn().mockResolvedValue(CLIENT),
    existe: vi.fn().mockResolvedValue(true),
    creer: vi.fn().mockResolvedValue(CLIENT),
    listerInterventions: vi.fn().mockResolvedValue({ interventions: [], total: 0 }),
    modifierClient: vi.fn((travail: (ops: OperationsSurClient) => Promise<unknown>) =>
      travail(operations),
    ),
  };
  const horloge = { maintenant: () => MAINTENANT } as Horloge;
  const journal = { enregistrer: vi.fn().mockResolvedValue(undefined), historiqueDe: vi.fn() };
  const service = new ClientsService(
    depot as unknown as ClientsRepository,
    horloge,
    journal as unknown as JournalDesActions,
  );
  return { service, depot, operations, journal };
}

describe('ClientsService', () => {
  describe('export CSV (US32)', () => {
    const CRITERES: CriteresClients = { archives: false, tri: 'nomAffiche', recherche: 'payet' };
    const GESTIONNAIRE = { id: 3, role: 'GESTIONNAIRE' as const };

    function clients(nombre: number, adressesParClient = 1): ClientAvecAdresses[] {
      return Array.from({ length: nombre }, (_, rang) => ({
        ...CLIENT,
        id: rang + 1,
        adresses: Array.from({ length: adressesParClient }, (_v, i) => ({ ...ADRESSE, id: i + 1 })),
      }));
    }

    it('lit toute la liste filtrée avec le tri de la liste, sans pagination de 100', async () => {
      const { service, depot } = creerService();

      await service.exporter(CRITERES, GESTIONNAIRE, ['recherche']);

      expect(depot.rechercher).toHaveBeenCalledWith({ ...CRITERES, page: 1, limit: 5001 });
    });

    it('renvoie le fichier clients-AAAA-MM-JJ.csv daté du jour à La Réunion', async () => {
      const { service } = creerService();

      const fichier = await service.exporter(CRITERES, GESTIONNAIRE, []);

      expect(fichier.nom).toBe('clients-2026-12-07.csv');
      expect(fichier.contenu.startsWith('\uFEFFid;type_client;nom;')).toBe(true);
      expect(fichier.contenu).toContain('\r\n8;PARTICULIER;Payet;Hélène;;0692123456;');
    });

    it('journalise EXPORT_CSV une fois, avec le nombre de lignes et le nom des filtres seulement', async () => {
      const { service, depot, journal } = creerService();
      depot.rechercher.mockResolvedValue({ clients: clients(2, 2), total: 2 });

      await service.exporter(CRITERES, { ...GESTIONNAIRE, email: 's@exemple.re' } as never, [
        'recherche',
        'tri',
      ]);

      expect(journal.enregistrer).toHaveBeenCalledTimes(1);
      expect(journal.enregistrer).toHaveBeenCalledWith({
        type: 'EXPORT_CSV',
        auteur: { id: 3, role: 'GESTIONNAIRE' },
        ressource: 'clients',
        lignes: 4,
        filtres: ['recherche', 'tri'],
      });
    });

    it('accepte exactement 5 000 lignes', async () => {
      const { service, depot, journal } = creerService();
      depot.rechercher.mockResolvedValue({ clients: clients(5000), total: 5000 });

      await service.exporter(CRITERES, GESTIONNAIRE, []);

      expect(journal.enregistrer).toHaveBeenCalledWith(expect.objectContaining({ lignes: 5000 }));
    });

    it('refuse plus de 5 000 clients (400) sans rien journaliser', async () => {
      const { service, depot, journal } = creerService();
      depot.rechercher.mockResolvedValue({ clients: clients(5001), total: 7000 });

      await expect(service.exporter(CRITERES, GESTIONNAIRE, [])).rejects.toThrow(
        new BadRequestException('L’export dépasse 5 000 lignes : affinez les filtres.'),
      );
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });

    it('refuse 2 501 clients à deux adresses : la limite porte sur les lignes du fichier', async () => {
      const { service, depot, journal } = creerService();
      depot.rechercher.mockResolvedValue({ clients: clients(2501, 2), total: 2501 });

      await expect(service.exporter(CRITERES, GESTIONNAIRE, [])).rejects.toThrow(
        BadRequestException,
      );
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });
  });

  describe('liste et consultation', () => {
    it('met en forme une page de clients avec le nom affiché', async () => {
      const { service } = creerService();

      const page = await service.lister({ page: 3, limit: 20, archives: false, tri: 'nomAffiche' });

      expect(page.meta).toEqual({ page: 3, limit: 20, total: 41, totalPages: 3 });
      expect(page.data[0]).toMatchObject({ id: 8, nomAffiche: 'Hélène Payet' });
      expect(page.data[0]).not.toHaveProperty('idClient');
      expect(page.data[0].adresses[0]).not.toHaveProperty('idClient');
    });

    it('répond 404 pour un client inexistant', async () => {
      const { service, depot } = creerService();
      depot.trouver.mockResolvedValue(null);

      await expect(service.consulter(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('création', () => {
    it('crée le client et son adresse en un seul appel au dépôt (RG21)', async () => {
      const { service, depot } = creerService();
      const nouveau: NouveauClient = {
        typeClient: 'PARTICULIER',
        nomClient: 'Payet',
        prenomClient: 'Hélène',
        raisonSociale: null,
        telephone: '0692123456',
        emailClient: null,
        adresse: {
          rue: '12 rue des Lilas',
          complement: null,
          codePostal: '97400',
          ville: 'Saint-Denis',
          infosAcces: null,
        },
      };

      const client = await service.creer(nouveau);

      expect(depot.creer).toHaveBeenCalledExactlyOnceWith(nouveau);
      expect(client.adresses).toHaveLength(1);
    });
  });

  describe('modification', () => {
    it('enregistre les seuls champs envoyés', async () => {
      const { service, operations } = creerService();

      await service.modifier(8, { telephone: '0692000001' });

      expect(operations.modifierClient).toHaveBeenCalledExactlyOnceWith(8, {
        telephone: '0692000001',
      });
    });

    it('vérifie la raison sociale quand un particulier devient professionnel', async () => {
      const { service, operations } = creerService();

      await expect(service.modifier(8, { typeClient: 'PROFESSIONNEL' })).rejects.toThrow(
        BadRequestException,
      );
      expect(operations.modifierClient).not.toHaveBeenCalled();
    });

    it('accepte le changement de type quand la raison sociale est fournie', async () => {
      const { service, operations } = creerService();

      await service.modifier(8, { typeClient: 'PROFESSIONNEL', raisonSociale: 'Payet SARL' });

      expect(operations.modifierClient).toHaveBeenCalledOnce();
    });

    it('refuse d’effacer le nom d’un particulier', async () => {
      const { service } = creerService();

      await expect(service.modifier(8, { nomClient: null })).rejects.toThrow(BadRequestException);
    });

    it('refuse de modifier un client archivé', async () => {
      const { service, operations } = creerService({ ...VERROUILLE, archive: true });

      await expect(service.modifier(8, { telephone: '0692000001' })).rejects.toThrow(
        'Ce client est archivé : il ne peut plus être modifié.',
      );
      expect(operations.modifierClient).not.toHaveBeenCalled();
    });

    it('répond 404 pour un client inexistant', async () => {
      const { service } = creerService(null);

      await expect(service.modifier(99, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('archivage', () => {
    it('archive le client à l’heure de l’horloge (RG22)', async () => {
      const { service, operations } = creerService();

      await service.archiver(8);

      expect(operations.archiverClient).toHaveBeenCalledExactlyOnceWith(8, MAINTENANT);
    });

    it('refuse 409 tant que des interventions sont actives, en donnant leur nombre', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.compterInterventionsActivesDuClient).mockResolvedValue(2);

      const archivage = service.archiver(8);

      await expect(archivage).rejects.toThrow(ConflictException);
      await expect(archivage).rejects.toThrow('(2 actuellement)');
      expect(operations.archiverClient).not.toHaveBeenCalled();
    });

    it('refuse d’archiver deux fois', async () => {
      const { service } = creerService({ ...VERROUILLE, archive: true });

      await expect(service.archiver(8)).rejects.toThrow('Ce client est déjà archivé.');
    });
  });

  describe('adresses (US07)', () => {
    const NOUVELLE = {
      rue: '3 chemin Bois de Nèfles',
      complement: null,
      codePostal: '97490',
      ville: 'Sainte-Clotilde',
      infosAcces: null,
    };

    it('ajoute une adresse à un client en service', async () => {
      const { service, operations } = creerService();

      const adresse = await service.ajouterAdresse(8, NOUVELLE);

      expect(operations.ajouterAdresse).toHaveBeenCalledExactlyOnceWith(8, NOUVELLE);
      expect(adresse).not.toHaveProperty('idClient');
    });

    it('refuse d’ajouter une adresse à un client archivé', async () => {
      const { service, operations } = creerService({ ...VERROUILLE, archive: true });

      await expect(service.ajouterAdresse(8, NOUVELLE)).rejects.toThrow(BadRequestException);
      expect(operations.ajouterAdresse).not.toHaveBeenCalled();
    });

    it('répond 404 pour l’adresse d’un autre client, sans la modifier', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.trouverAdresse).mockResolvedValue({
        id: 15,
        idClient: 9,
        archive: false,
      });

      await expect(service.modifierAdresse(8, 15, { ville: 'Le Port' })).rejects.toThrow(
        'Adresse introuvable pour ce client.',
      );
      await expect(service.archiverAdresse(8, 15)).rejects.toThrow(NotFoundException);
      expect(operations.modifierAdresse).not.toHaveBeenCalled();
      expect(operations.archiverAdresse).not.toHaveBeenCalled();
    });

    it('refuse de modifier ou de réarchiver une adresse archivée', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.trouverAdresse).mockResolvedValue({
        id: 15,
        idClient: 8,
        archive: true,
      });

      await expect(service.modifierAdresse(8, 15, { ville: 'Le Port' })).rejects.toThrow(
        'Cette adresse est archivée : elle ne peut plus être modifiée.',
      );
      await expect(service.archiverAdresse(8, 15)).rejects.toThrow(
        'Cette adresse est déjà archivée.',
      );
      expect(operations.modifierAdresse).not.toHaveBeenCalled();
    });

    it('refuse d’archiver la dernière adresse du client (RG21)', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.compterAdressesActives).mockResolvedValue(1);

      await expect(service.archiverAdresse(8, 15)).rejects.toThrow(BadRequestException);
      expect(operations.archiverAdresse).not.toHaveBeenCalled();
    });

    it('refuse 409 une adresse qui a des interventions actives', async () => {
      const { service, operations } = creerService();
      vi.mocked(operations.compterInterventionsActivesDeLAdresse).mockResolvedValue(1);

      await expect(service.archiverAdresse(8, 15)).rejects.toThrow(ConflictException);
    });

    it('archive l’adresse à l’heure de l’horloge', async () => {
      const { service, operations } = creerService();

      const adresse = await service.archiverAdresse(8, 15);

      expect(operations.archiverAdresse).toHaveBeenCalledExactlyOnceWith(15, MAINTENANT);
      expect(adresse).toMatchObject({ archive: true, archiveLe: MAINTENANT });
    });
  });

  describe('historique', () => {
    it('répond 404 pour un client inexistant, sans lire les interventions', async () => {
      const { service, depot } = creerService();
      depot.existe.mockResolvedValue(false);

      await expect(service.historique(99, { page: 1, limit: 20 })).rejects.toThrow(
        NotFoundException,
      );
      expect(depot.listerInterventions).not.toHaveBeenCalled();
    });

    it('transmet les filtres et renvoie une page vide', async () => {
      const { service, depot } = creerService();
      const filtres = { page: 1, limit: 20, statuts: ['TERMINEE' as const] };

      const page = await service.historique(8, filtres);

      expect(depot.listerInterventions).toHaveBeenCalledExactlyOnceWith(8, filtres);
      expect(page).toEqual({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    });
  });
});
