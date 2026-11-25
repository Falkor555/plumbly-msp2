import { ConflictException, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.ts';
import type { JournalDesActions } from '../../journal/journal-des-actions.js';
import type { NouveauClient } from '../clients.types.js';
import {
  type ClientAMettreAJour,
  type ImportClientsRepository,
  ImportDejaEnCours,
  type OperationsDImport,
} from './import-clients.repository.js';
import { ImportClientsService } from './import-clients.service.js';
import type { ClientExistant, StrategieDoublons } from './import-clients.types.js';

const GESTIONNAIRE = { id: 3, role: 'GESTIONNAIRE' as const };

const EN_TETE = 'type;nom;prenom;raison_sociale;telephone;email;rue;code_postal;ville';
const DUPONT =
  ';Dupont;Marie;;0692 12 34 56;marie@exemple.re;12 rue des Manguiers;97400;Saint-Denis';
const HOARAU = ';Hoarau;Jean;;0692987654;;8 avenue de la Victoire;97410;Saint-Pierre';
const INVALIDE = ';Payet;;;0692;;1 rue;97400;Saint-Denis';

function contenu(...lignes: string[]): string {
  return [EN_TETE, ...lignes].join('\n');
}

/** Client 8, Marie Dupont, tel qu'il est en base avant l'import. */
function enBase(champs: Partial<ClientAMettreAJour> = {}): ClientAMettreAJour {
  return {
    id: 8,
    typeClient: 'PARTICULIER',
    nomClient: 'Dupont',
    prenomClient: 'Marie',
    raisonSociale: null,
    telephone: '0692123456',
    emailClient: 'ancien@exemple.re',
    archive: false,
    adresses: [{ rue: '12 Rue des  Manguiers ', codePostal: '97400', ville: 'SAINT-DENIS' }],
    ...champs,
  };
}

function existant(client: ClientAMettreAJour): ClientExistant {
  return {
    id: client.id,
    telephone: client.telephone,
    emailClient: client.emailClient,
    archive: client.archive,
  };
}

function creerService({
  avantVerrou = [] as ClientExistant[],
  sousVerrou = [] as ClientExistant[],
  aMettreAJour = [] as ClientAMettreAJour[],
  echec = undefined as unknown,
} = {}) {
  // Suit l'ordre des appels : transaction, écritures, validation, journal.
  const evenements: string[] = [];
  let prochainId = 100;
  const operations: OperationsDImport = {
    trouverClientsCorrespondants: vi.fn(() => {
      evenements.push('doublons relus sous verrou');
      return Promise.resolve(sousVerrou);
    }),
    creerClient: vi.fn((client: NouveauClient) => {
      evenements.push(`création ${client.nomClient}`);
      return Promise.resolve((prochainId += 1));
    }),
    verrouillerClients: vi.fn((identifiants: number[]) => {
      evenements.push(`verrou des clients ${identifiants.join(',')}`);
      return Promise.resolve(aMettreAJour.map((client) => structuredClone(client)));
    }),
    modifierClient: vi.fn(() => Promise.resolve()),
    ajouterAdresse: vi.fn(() => Promise.resolve()),
  };
  const depot = {
    trouverClientsCorrespondants: vi.fn().mockResolvedValue(avantVerrou),
    importer: vi.fn(async (travail: (ops: OperationsDImport) => Promise<unknown>) => {
      evenements.push('transaction ouverte');
      if (echec !== undefined) {
        throw echec;
      }
      const resultat = await travail(operations);
      evenements.push('transaction validée');
      return resultat;
    }),
  };
  const journal = {
    enregistrer: vi.fn(() => {
      evenements.push('journal');
      return Promise.resolve();
    }),
    historiqueDe: vi.fn(),
  };
  const service = new ImportClientsService(
    depot as unknown as ImportClientsRepository,
    journal as unknown as JournalDesActions,
  );
  return { service, depot, operations, journal, evenements };
}

const importer = (
  service: ImportClientsService,
  texte: string,
  strategieDoublons: StrategieDoublons = 'IGNORER',
) => service.importer({ contenu: texte, strategieDoublons }, GESTIONNAIRE);

describe('ImportClientsService', () => {
  describe('analyser', () => {
    it('cherche les doublons en une requête, sans transaction ni journal', async () => {
      const { service, depot, journal } = creerService({ avantVerrou: [existant(enBase())] });

      const reponse = await service.analyser({ contenu: contenu(DUPONT, HOARAU) });

      expect(depot.trouverClientsCorrespondants).toHaveBeenCalledWith({
        telephones: ['0692123456', '0692987654'],
        emails: ['marie@exemple.re'],
      });
      expect(depot.importer).not.toHaveBeenCalled();
      expect(journal.enregistrer).not.toHaveBeenCalled();
      expect(reponse.totaux).toEqual({ lignes: 2, valides: 1, doublons: 1, invalides: 0 });
    });
  });

  describe('importer', () => {
    it('crée les lignes valides, rejette les invalides, sans empêcher les autres (RG27)', async () => {
      const { service, operations } = creerService();

      const rapport = await importer(service, contenu(DUPONT, INVALIDE, HOARAU));

      expect(operations.creerClient).toHaveBeenCalledTimes(2);
      expect(rapport).toEqual({
        totaux: { crees: 2, misAJour: 0, ignores: 0, rejetes: 1 },
        lignes: [
          { numero: 2, resultat: 'CREE', clientId: 101 },
          {
            numero: 3,
            resultat: 'REJETE',
            erreurs: [
              'telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)',
            ],
          },
          { numero: 4, resultat: 'CREE', clientId: 102 },
        ],
      });
    });

    it('prend ses décisions sur les doublons relus sous le verrou, pas sur ceux de l’aperçu', async () => {
      // Avant le verrou, aucun doublon ; pendant l'attente, un autre import a créé Marie Dupont.
      const { service, operations } = creerService({
        avantVerrou: [],
        sousVerrou: [existant(enBase())],
      });

      const rapport = await importer(service, contenu(DUPONT));

      expect(operations.creerClient).not.toHaveBeenCalled();
      expect(rapport.lignes).toEqual([
        { numero: 2, resultat: 'IGNORE', clientId: 8, motif: 'Même téléphone que le client 8' },
      ]);
    });

    it('journalise CLIENTS_IMPORTES une fois, après la validation de la transaction', async () => {
      const { service, journal, evenements } = creerService({ sousVerrou: [existant(enBase())] });

      await importer(service, contenu(DUPONT, HOARAU, INVALIDE));

      expect(evenements).toEqual([
        'transaction ouverte',
        'doublons relus sous verrou',
        'création Hoarau',
        'transaction validée',
        'journal',
      ]);
      expect(journal.enregistrer).toHaveBeenCalledWith({
        type: 'CLIENTS_IMPORTES',
        auteur: { id: 3, role: 'GESTIONNAIRE' },
        strategieDoublons: 'IGNORER',
        crees: 1,
        misAJour: 0,
        ignores: 1,
        rejetes: 1,
      });
    });

    it('journalise aussi un import sans aucune ligne à enregistrer', async () => {
      const { service, journal } = creerService();

      const rapport = await importer(service, contenu(INVALIDE));

      expect(rapport.totaux).toEqual({ crees: 0, misAJour: 0, ignores: 0, rejetes: 1 });
      expect(journal.enregistrer).toHaveBeenCalledTimes(1);
    });

    describe('IGNORER', () => {
      it('ne touche à aucun doublon', async () => {
        const { service, operations } = creerService({ sousVerrou: [existant(enBase())] });

        await importer(service, contenu(DUPONT), 'IGNORER');

        expect(operations.verrouillerClients).not.toHaveBeenCalled();
        expect(operations.modifierClient).not.toHaveBeenCalled();
        expect(operations.ajouterAdresse).not.toHaveBeenCalled();
      });
    });

    describe('METTRE_A_JOUR (RG28)', () => {
      it('remplace seulement les champs renseignés qui diffèrent, sans en vider aucun', async () => {
        const client = enBase();
        const { service, operations } = creerService({
          sousVerrou: [existant(client)],
          aMettreAJour: [client],
        });
        // Prénom vide et e-mail nouveau dans le fichier.
        const ligne =
          ';Dupont;;;0692123456;marie@exemple.re;12 rue des Manguiers;97400;Saint-Denis';

        const rapport = await importer(service, contenu(ligne), 'METTRE_A_JOUR');

        expect(operations.modifierClient).toHaveBeenCalledWith(8, {
          emailClient: 'marie@exemple.re',
        });
        expect(rapport.lignes).toEqual([{ numero: 2, resultat: 'MIS_A_JOUR', clientId: 8 }]);
      });

      it('ne change pas le type quand il est déduit, seulement quand la colonne est renseignée', async () => {
        const professionnel = enBase({
          typeClient: 'PROFESSIONNEL',
          nomClient: null,
          raisonSociale: 'Boulangerie',
        });
        const { service, operations } = creerService({
          sousVerrou: [existant(professionnel)],
          aMettreAJour: [professionnel],
        });

        await importer(service, contenu(DUPONT), 'METTRE_A_JOUR');

        // Le type reste PROFESSIONNEL et la raison sociale est gardée (aucun champ vidé).
        expect(operations.modifierClient).toHaveBeenCalledWith(8, {
          nomClient: 'Dupont',
          emailClient: 'marie@exemple.re',
        });
      });

      it('ne passe pas un client en professionnel sans raison sociale : la ligne est rejetée', async () => {
        const particulier = enBase();
        const { service, operations } = creerService({
          sousVerrou: [existant(particulier)],
          aMettreAJour: [particulier],
        });
        // Type renseigné, sans raison sociale ni dans le fichier ni chez le client.
        const versPro = 'PROFESSIONNEL;Dupont;;;0692123456;;12 rue des Manguiers;97400;Saint-Denis';

        const rapport = await importer(service, contenu(versPro), 'METTRE_A_JOUR');

        expect(operations.modifierClient).not.toHaveBeenCalled();
        expect(rapport.lignes).toEqual([
          {
            numero: 2,
            resultat: 'REJETE',
            erreurs: ['raisonSociale est obligatoire pour un professionnel'],
          },
        ]);
      });

      it('n’ajoute pas une adresse déjà connue (casse et espaces en trop ignorés)', async () => {
        const client = enBase();
        const { service, operations } = creerService({
          sousVerrou: [existant(client)],
          aMettreAJour: [client],
        });

        await importer(service, contenu(DUPONT), 'METTRE_A_JOUR');

        expect(operations.ajouterAdresse).not.toHaveBeenCalled();
      });

      it('ajoute une adresse nouvelle une seule fois, même répétée dans le fichier', async () => {
        const client = enBase();
        const { service, operations } = creerService({
          sousVerrou: [existant(client)],
          aMettreAJour: [client],
        });
        const autreAdresse = DUPONT.replace('12 rue des Manguiers', '3 chemin Neuf');

        const rapport = await importer(
          service,
          contenu(autreAdresse, autreAdresse),
          'METTRE_A_JOUR',
        );

        expect(operations.ajouterAdresse).toHaveBeenCalledTimes(1);
        expect(operations.ajouterAdresse).toHaveBeenCalledWith(8, {
          rue: '3 chemin Neuf',
          complement: null,
          codePostal: '97400',
          ville: 'Saint-Denis',
          infosAcces: null,
        });
        expect(rapport.totaux.misAJour).toBe(2);
      });

      it('crée d’abord, puis verrouille une seule fois les clients à mettre à jour', async () => {
        const client = enBase();
        const { service, evenements } = creerService({
          sousVerrou: [existant(client)],
          aMettreAJour: [client],
        });

        await importer(service, contenu(DUPONT, HOARAU, DUPONT), 'METTRE_A_JOUR');

        expect(evenements.slice(1, 4)).toEqual([
          'doublons relus sous verrou',
          'création Hoarau',
          'verrou des clients 8',
        ]);
      });

      it('ne touche jamais un client archivé', async () => {
        const archive = enBase({ archive: true });
        const { service, operations } = creerService({ sousVerrou: [existant(archive)] });

        const rapport = await importer(service, contenu(DUPONT), 'METTRE_A_JOUR');

        expect(operations.verrouillerClients).not.toHaveBeenCalled();
        expect(rapport.lignes).toEqual([
          {
            numero: 2,
            resultat: 'IGNORE',
            clientId: 8,
            motif: 'Client archivé : il ne sera pas mis à jour',
          },
        ]);
      });

      it('ignore un client archivé entre la recherche des doublons et le verrou de sa ligne', async () => {
        const client = enBase();
        const { service, operations } = creerService({
          sousVerrou: [existant(client)],
          aMettreAJour: [{ ...client, archive: true }],
        });

        const rapport = await importer(service, contenu(DUPONT), 'METTRE_A_JOUR');

        expect(operations.modifierClient).not.toHaveBeenCalled();
        expect(rapport.lignes[0]).toMatchObject({
          resultat: 'IGNORE',
          motif: 'Client archivé : il ne sera pas mis à jour',
        });
      });
    });

    describe('erreurs', () => {
      it('répond 409 quand un autre import tient le verrou, sans journal', async () => {
        const { service, journal } = creerService({ echec: new ImportDejaEnCours() });

        await expect(importer(service, contenu(DUPONT))).rejects.toThrow(
          new ConflictException('Un import est déjà en cours, réessayez dans un instant.'),
        );
        expect(journal.enregistrer).not.toHaveBeenCalled();
      });

      it('journalise le code PostgreSQL et la contrainte d’une erreur de la base, sans la ligne', async () => {
        const erreur = new Prisma.PrismaClientKnownRequestError(
          'Database error. Code: `23514`. Message: `new row for relation "client" violates check constraint "client_identite_check"`',
          {
            code: 'P2039',
            clientVersion: '7.10.1',
            meta: {
              driverAdapterError: {
                cause: {
                  kind: 'postgres',
                  originalCode: '23514',
                  originalMessage:
                    'new row for relation "client" violates check constraint "client_identite_check"',
                  detail: 'Failing row contains (12, PARTICULIER, Dupont, Marie, 0692123456).',
                },
              },
            },
          },
        );
        const { service, journal } = creerService({ echec: erreur });
        const journalDeNest = vi
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);

        const refus = await importer(service, contenu(DUPONT)).catch((e: unknown) => e);

        expect(journalDeNest).toHaveBeenCalledTimes(1);
        const ecrit = JSON.stringify(journalDeNest.mock.calls);
        expect(ecrit).toContain('PostgreSQL 23514');
        expect(ecrit).toContain('contrainte client_identite_check');
        expect(ecrit).not.toMatch(/Dupont|Marie|0692123456|Failing row|marie@/);
        expect(refus).toBeInstanceOf(HttpException);
        expect((refus as HttpException).getStatus()).toBe(500);
        expect((refus as HttpException).getResponse()).toBe('Internal server error');
        expect((refus as HttpException).cause).toBeUndefined();
        expect(journal.enregistrer).not.toHaveBeenCalled();
        journalDeNest.mockRestore();
      });

      it('laisse passer une erreur qui ne vient pas de la base', async () => {
        const { service } = creerService({ echec: new TypeError('bogue') });

        await expect(importer(service, contenu(DUPONT))).rejects.toThrow(TypeError);
      });
    });
  });
});
