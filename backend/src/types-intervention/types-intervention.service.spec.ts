import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TypesInterventionRepository } from './types-intervention.repository.js';
import { TypesInterventionService } from './types-intervention.service.js';

const FUITE = { id: 1, libelle: 'Fuite', dureeDefautMin: 60 };

function creerService(reponse: Awaited<ReturnType<TypesInterventionRepository['creer']>>) {
  const depot = {
    lister: vi.fn().mockResolvedValue([FUITE]),
    creer: vi.fn().mockResolvedValue(reponse),
    modifier: vi.fn().mockResolvedValue(reponse),
  };
  return {
    service: new TypesInterventionService(depot as unknown as TypesInterventionRepository),
    depot,
  };
}

describe('TypesInterventionService', () => {
  it('crée un type et le renvoie', async () => {
    const { service, depot } = creerService(FUITE);

    const type = await service.creer({ libelle: 'Fuite', dureeDefautMin: 60 });

    expect(type).toEqual(FUITE);
    expect(depot.creer).toHaveBeenCalledWith({ libelle: 'Fuite', dureeDefautMin: 60 });
  });

  it('répond 409 en nommant le libellé déjà utilisé', async () => {
    const { service } = creerService('libelle-deja-utilise');

    await expect(service.creer({ libelle: 'Fuite', dureeDefautMin: 60 })).rejects.toThrow(
      new ConflictException('Le type d’intervention « Fuite » existe déjà.'),
    );
  });

  it('répond 404 quand le type à modifier n’existe pas', async () => {
    const { service } = creerService('introuvable');

    await expect(service.modifier(99, { dureeDefautMin: 90 })).rejects.toThrow(NotFoundException);
  });

  it('modifie seulement les champs reçus', async () => {
    const { service, depot } = creerService({ ...FUITE, dureeDefautMin: 90 });

    await service.modifier(1, { dureeDefautMin: 90 });

    expect(depot.modifier).toHaveBeenCalledWith(1, { dureeDefautMin: 90 });
  });
});
