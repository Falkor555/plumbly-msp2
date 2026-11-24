import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type EcritureDeType,
  TypesInterventionRepository,
} from './types-intervention.repository.js';
import type {
  ModificationTypeIntervention,
  NouveauTypeIntervention,
  TypeInterventionApi,
} from './types-intervention.types.js';

/**
 * Types d'intervention et leur durée par défaut (US14). Modifier la durée par défaut ne change
 * pas les interventions déjà créées : elles ont copié la durée à leur création.
 */
@Injectable()
export class TypesInterventionService {
  constructor(private readonly depot: TypesInterventionRepository) {}

  lister(): Promise<TypeInterventionApi[]> {
    return this.depot.lister();
  }

  async creer(type: NouveauTypeIntervention): Promise<TypeInterventionApi> {
    return accepte(await this.depot.creer(type), type.libelle);
  }

  async modifier(
    idType: number,
    modification: ModificationTypeIntervention,
  ): Promise<TypeInterventionApi> {
    return accepte(await this.depot.modifier(idType, modification), modification.libelle);
  }
}

function accepte(ecriture: EcritureDeType, libelle: string | undefined): TypeInterventionApi {
  if (ecriture === 'introuvable') {
    throw new NotFoundException('Type d’intervention introuvable.');
  }
  if (ecriture === 'libelle-deja-utilise') {
    throw new ConflictException(`Le type d’intervention « ${libelle} » existe déjà.`);
  }
  return ecriture;
}
