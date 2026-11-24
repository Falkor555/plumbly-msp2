import { Logger } from '@nestjs/common';
import type { Horloge } from '../commun/horloge.js';
import { JournalDesActionsDansMongoDb } from './journal-des-actions-mongodb.js';
import type { JournalRepository } from './journal.repository.js';
import type { EmailMasque, StatutModifie } from './journal.types.js';

const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const PLANIFICATION: StatutModifie = {
  type: 'STATUT_MODIFIE',
  auteur: { id: 2, role: 'GESTIONNAIRE' },
  interventionId: 42,
  ancienStatut: 'A_PLANIFIER',
  nouveauStatut: 'PLANIFIEE',
};

function creerJournal() {
  const depot = {
    inserer: vi.fn().mockResolvedValue(undefined),
    listerPourEntite: vi.fn().mockResolvedValue([]),
  };
  const horloge = { maintenant: () => MAINTENANT } as Horloge;
  const journal = new JournalDesActionsDansMongoDb(depot as unknown as JournalRepository, horloge);
  return { journal, depot };
}

describe('JournalDesActionsDansMongoDb', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('insère le document daté par l’horloge', async () => {
    const { journal, depot } = creerJournal();

    await journal.enregistrer(PLANIFICATION);

    expect(depot.inserer).toHaveBeenCalledWith(
      expect.objectContaining({
        date: MAINTENANT,
        action: 'STATUT_MODIFIE',
        entite: { type: 'intervention', id: 42 },
      }),
    );
  });

  it('trace une erreur d’insertion sans la renvoyer à l’appelant', async () => {
    const { journal, depot } = creerJournal();
    depot.inserer.mockRejectedValue(new Error('MongoDB injoignable'));
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(journal.enregistrer(PLANIFICATION)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      'STATUT_MODIFIE non enregistré dans le journal des actions (intervention 42)',
      expect.stringContaining('MongoDB injoignable'),
    );
  });

  it('ne met pas l’e-mail, même masqué, dans le log d’erreur', async () => {
    const { journal, depot } = creerJournal();
    depot.inserer.mockRejectedValue(new Error('MongoDB injoignable'));
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await journal.enregistrer({
      type: 'CONNEXION_ECHOUEE',
      emailMasque: 'k***@exemple.fr' as EmailMasque,
    });

    expect(log).toHaveBeenCalledWith(
      'CONNEXION_ECHOUEE non enregistré dans le journal des actions (utilisateur inconnu)',
      expect.any(String),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('exemple.fr');
  });

  it('lit l’historique d’une entité dans le repository', async () => {
    const { journal, depot } = creerJournal();

    await journal.historiqueDe({ type: 'intervention', id: 42 }, 100);

    expect(depot.listerPourEntite).toHaveBeenCalledWith({ type: 'intervention', id: 42 }, 100);
  });
});
