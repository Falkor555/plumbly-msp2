import { BadRequestException } from '@nestjs/common';
import type { ReportingRepository } from './reporting.repository.js';
import { ReportingService } from './reporting.service.js';

function creerService(): { service: ReportingService; depot: ReportingRepository } {
  const depot = {
    compterInterventionsParTechnicienEtStatut: vi.fn().mockResolvedValue([]),
    detaillerTournee: vi.fn().mockResolvedValue(null),
    calculerTempsMoyenDeTraitement: vi.fn().mockResolvedValue({ parType: [], ensemble: {} }),
  } as unknown as ReportingRepository;
  return { service: new ReportingService(depot), depot };
}

describe('ReportingService', () => {
  it('transmet une période valide au repository', async () => {
    const { service, depot } = creerService();

    await service.compterInterventionsParTechnicienEtStatut({ du: '2026-11-01', au: '2026-11-30' });

    expect(depot.compterInterventionsParTechnicienEtStatut).toHaveBeenCalledWith({
      du: '2026-11-01',
      au: '2026-11-30',
    });
  });

  it("accepte une période d'un seul jour", async () => {
    const { service, depot } = creerService();

    await service.calculerTempsMoyenDeTraitement({ du: '2026-11-24', au: '2026-11-24' });

    expect(depot.calculerTempsMoyenDeTraitement).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['vide', ''],
    ['au format français', '24/11/2026'],
    ['inexistante (30 février)', '2026-02-30'],
    ['suivie de SQL', "2026-11-24'; DROP TABLE intervention; --"],
    ['précédée de SQL', "' OR '1'='1"],
  ])('refuse une date %s sans interroger la base', async (_cas, date) => {
    const { service, depot } = creerService();

    const appel = service.detaillerTournee(1, date);

    await expect(appel).rejects.toThrow(BadRequestException);
    expect(depot.detaillerTournee).not.toHaveBeenCalled();
  });

  it('refuse une période dont le début suit la fin', async () => {
    const { service, depot } = creerService();

    const appel = service.compterInterventionsParTechnicienEtStatut({
      du: '2026-11-30',
      au: '2026-11-01',
    });

    await expect(appel).rejects.toThrow(/Période invalide/);
    expect(depot.compterInterventionsParTechnicienEtStatut).not.toHaveBeenCalled();
  });

  it.each([
    ['nul', 0],
    ['négatif', -1],
    ['décimal', 1.5],
    ['hors des entiers PostgreSQL', 2_147_483_648],
    ['NaN', Number.NaN],
  ])('refuse un identifiant de technicien %s', async (_cas, identifiant) => {
    const { service, depot } = creerService();

    const appel = service.detaillerTournee(identifiant, '2026-11-24');

    await expect(appel).rejects.toThrow(/Identifiant invalide/);
    expect(depot.detaillerTournee).not.toHaveBeenCalled();
  });
});
