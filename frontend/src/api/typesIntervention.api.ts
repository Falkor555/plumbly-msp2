import { api } from './clientHttp';
import type { TypeIntervention } from './types';

export const typesInterventionApi = {
  /** US14 : tous les types, triés par libellé, avec leur durée par défaut. */
  lister: (signal?: AbortSignal): Promise<TypeIntervention[]> =>
    api.get<TypeIntervention[]>('/intervention-types', { signal }),
};
