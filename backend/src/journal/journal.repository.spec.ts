import { Logger } from '@nestjs/common';
import { MongoNetworkError } from 'mongodb';
import { CleInterdite } from './cles-mongodb.js';
import type { ConnexionMongoDb } from './connexion-mongodb.js';
import { JournalRepository } from './journal.repository.js';
import { type DocumentJournal, JournalIndisponible } from './journal.types.js';

const DOCUMENT: DocumentJournal = {
  date: new Date('2026-12-08T05:03:12.000Z'),
  action: 'STATUT_MODIFIE',
  auteur: { id: 2, role: 'GESTIONNAIRE' },
  entite: { type: 'intervention', id: 42 },
  avant: { statut: 'A_PLANIFIER' },
  apres: { statut: 'PLANIFIEE' },
};

function creerRepository() {
  const curseur = { toArray: vi.fn().mockResolvedValue([]) };
  const collection = {
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    createIndexes: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockReturnValue(curseur),
  };
  const connexion = {
    base: () => ({ collection: () => collection }),
  } as unknown as ConnexionMongoDb;
  return { depot: new JournalRepository(connexion), collection, curseur };
}

function serveurInjoignable(): MongoNetworkError {
  return new MongoNetworkError('connect ECONNREFUSED 127.0.0.1:27017');
}

describe('JournalRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('insère une copie du document, sans modifier celui reçu', async () => {
    const { depot, collection } = creerRepository();

    await depot.inserer(DOCUMENT);

    expect(collection.insertOne).toHaveBeenCalledWith(DOCUMENT);
    expect(DOCUMENT).not.toHaveProperty('_id');
  });

  it('refuse un document qui contient une clé $… sans rien insérer', async () => {
    const { depot, collection } = creerRepository();
    const document = { ...DOCUMENT, contexte: { motif: { $ne: '' } } } as DocumentJournal;

    await expect(depot.inserer(document)).rejects.toThrow(CleInterdite);
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  it('lit l’historique avec un filtre construit par le code, trié du plus récent au plus ancien', async () => {
    const { depot, collection } = creerRepository();

    await depot.listerPourEntite({ type: 'intervention', id: 42 }, 100);

    expect(collection.find).toHaveBeenCalledWith(
      { 'entite.type': 'intervention', 'entite.id': 42 },
      { projection: { _id: 0 }, sort: { date: -1, _id: -1 }, limit: 100 },
    );
  });

  it('signale un journal indisponible quand MongoDB ne répond pas en lecture', async () => {
    const { depot, curseur } = creerRepository();
    curseur.toArray.mockRejectedValue(serveurInjoignable());

    const lecture = depot.listerPourEntite({ type: 'intervention', id: 42 }, 100);

    await expect(lecture).rejects.toThrow(JournalIndisponible);
  });

  it('démarre avec un avertissement si MongoDB est éteint, puis crée les index à la première écriture', async () => {
    const { depot, collection } = creerRepository();
    collection.createIndexes.mockRejectedValueOnce(serveurInjoignable());
    const avertissement = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await depot.onModuleInit();
    await depot.inserer(DOCUMENT);
    await depot.inserer(DOCUMENT);

    expect(avertissement).toHaveBeenCalledWith(
      expect.stringContaining('index du journal non créés'),
    );
    expect(collection.createIndexes).toHaveBeenCalledTimes(2);
  });
});
