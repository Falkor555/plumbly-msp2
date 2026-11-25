import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { HistoriqueRepository } from './historique.repository.js';
import { HistoriqueService, NOMBRE_MAXIMUM_ENTREES_HISTORIQUE } from './historique.service.js';
import type { JournalDesActions } from './journal-des-actions.js';
import { type DocumentJournal, JournalIndisponible } from './journal.types.js';

const PLANIFICATION: DocumentJournal = {
  date: new Date('2026-12-07T05:00:00.000Z'),
  action: 'STATUT_MODIFIE',
  auteur: { id: 2, role: 'GESTIONNAIRE' },
  entite: { type: 'intervention', id: 42 },
  avant: { statut: 'A_PLANIFIER' },
  apres: { statut: 'PLANIFIEE' },
};
const DEMARRAGE: DocumentJournal = {
  date: new Date('2026-12-08T04:30:00.000Z'),
  action: 'STATUT_MODIFIE',
  auteur: { id: 7, role: 'TECHNICIEN' },
  entite: { type: 'intervention', id: 42 },
  avant: { statut: 'PLANIFIEE' },
  apres: { statut: 'EN_COURS' },
};

function creerService(entrees: DocumentJournal[] = [PLANIFICATION, DEMARRAGE]) {
  const depot = {
    interventionExiste: vi.fn().mockResolvedValue(true),
    trouverNomsDesAuteurs: vi.fn().mockResolvedValue([
      { id: 2, nom: 'Payet', prenom: 'Sophie' },
      { id: 7, nom: 'Benali', prenom: 'Karim' },
    ]),
  };
  const journal = {
    enregistrer: vi.fn(),
    historiqueDe: vi.fn().mockResolvedValue(entrees),
  };
  const service = new HistoriqueService(
    depot as unknown as HistoriqueRepository,
    journal as unknown as JournalDesActions,
  );
  return { service, depot, journal };
}

describe('HistoriqueService', () => {
  it('répond 404 si l’intervention n’existe pas, sans lire le journal', async () => {
    const { service, depot, journal } = creerService();
    depot.interventionExiste.mockResolvedValue(false);

    const historique = service.historiqueDeLIntervention(99);

    await expect(historique).rejects.toThrow(NotFoundException);
    expect(journal.historiqueDe).not.toHaveBeenCalled();
  });

  it('lit les entrées de l’intervention, dans la limite prévue', async () => {
    const { service, journal } = creerService();

    await service.historiqueDeLIntervention(42);

    expect(journal.historiqueDe).toHaveBeenCalledWith(
      { type: 'intervention', id: 42 },
      NOMBRE_MAXIMUM_ENTREES_HISTORIQUE,
    );
  });

  it('renvoie les entrées de la plus récente à la plus ancienne, au format du contrat', async () => {
    const { service } = creerService([PLANIFICATION, DEMARRAGE]);

    const historique = await service.historiqueDeLIntervention(42);

    expect(historique).toEqual([
      {
        date: '2026-12-08T04:30:00.000Z',
        action: 'STATUT_MODIFIE',
        auteur: { id: 7, nom: 'Benali', prenom: 'Karim', role: 'TECHNICIEN' },
        avant: { statut: 'PLANIFIEE' },
        apres: { statut: 'EN_COURS' },
      },
      {
        date: '2026-12-07T05:00:00.000Z',
        action: 'STATUT_MODIFIE',
        auteur: { id: 2, nom: 'Payet', prenom: 'Sophie', role: 'GESTIONNAIRE' },
        avant: { statut: 'A_PLANIFIER' },
        apres: { statut: 'PLANIFIEE' },
      },
    ]);
  });

  it('garde l’ordre du journal entre deux entrées de même date', async () => {
    const retrait: DocumentJournal = {
      ...PLANIFICATION,
      avant: { statut: 'PLANIFIEE' },
      apres: { statut: 'A_PLANIFIER' },
    };
    const { service } = creerService([retrait, PLANIFICATION]);

    const historique = await service.historiqueDeLIntervention(42);

    expect(historique.map((entree) => entree.apres)).toEqual([
      { statut: 'A_PLANIFIER' },
      { statut: 'PLANIFIEE' },
    ]);
  });

  it('cherche les noms de chaque auteur une seule fois', async () => {
    const { service, depot } = creerService([PLANIFICATION, DEMARRAGE, PLANIFICATION]);

    await service.historiqueDeLIntervention(42);

    expect(depot.trouverNomsDesAuteurs).toHaveBeenCalledTimes(1);
    expect(depot.trouverNomsDesAuteurs).toHaveBeenCalledWith([2, 7]);
  });

  it('renvoie nom et prénom à null pour un auteur absent de PostgreSQL', async () => {
    const { service, depot } = creerService([DEMARRAGE]);
    depot.trouverNomsDesAuteurs.mockResolvedValue([]);

    const [entree] = await service.historiqueDeLIntervention(42);

    expect(entree.auteur).toEqual({ id: 7, nom: null, prenom: null, role: 'TECHNICIEN' });
  });

  it('renvoie un auteur null pour une entrée sans auteur', async () => {
    const sansAuteur: DocumentJournal = { ...DEMARRAGE, auteur: undefined };
    const { service } = creerService([sansAuteur]);

    const [entree] = await service.historiqueDeLIntervention(42);

    expect(entree.auteur).toBeNull();
  });

  it('garde le contexte d’une annulation (motif)', async () => {
    const annulation: DocumentJournal = {
      ...PLANIFICATION,
      action: 'INTERVENTION_ANNULEE',
      apres: { statut: 'ANNULEE' },
      contexte: { motif: 'Client absent' },
    };
    const { service } = creerService([annulation]);

    const [entree] = await service.historiqueDeLIntervention(42);

    expect(entree.contexte).toEqual({ motif: 'Client absent' });
  });

  it('renvoie une liste vide pour une intervention sans historique', async () => {
    const { service } = creerService([]);

    const historique = await service.historiqueDeLIntervention(42);

    expect(historique).toEqual([]);
  });

  it('répond 503, et non une liste vide, si MongoDB est injoignable', async () => {
    const { service, journal } = creerService();
    journal.historiqueDe.mockRejectedValue(new JournalIndisponible());

    const historique = service.historiqueDeLIntervention(42);

    await expect(historique).rejects.toThrow(ServiceUnavailableException);
  });

  it('laisse passer une autre erreur telle quelle', async () => {
    const { service, journal } = creerService();
    journal.historiqueDe.mockRejectedValue(new TypeError('bogue'));

    const historique = service.historiqueDeLIntervention(42);

    await expect(historique).rejects.toThrow(TypeError);
  });
});
