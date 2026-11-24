import { Injectable } from '@nestjs/common';
import { validerDate, validerIdentifiant, validerPeriode } from '../commun/validation.js';
import { ReportingRepository } from './reporting.repository.js';
import type {
  InterventionsParStatut,
  Periode,
  TempsMoyenDeTraitement,
  TourneeDetaillee,
} from './reporting.types.js';

/**
 * Reporting du tableau de bord. Valide les paramètres avant tout accès à la base : les requêtes
 * sont déjà paramétrées, cette validation renvoie une erreur 400 claire au lieu d'une erreur SQL.
 */
@Injectable()
export class ReportingService {
  constructor(private readonly depot: ReportingRepository) {}

  async compterInterventionsParTechnicienEtStatut(
    periode: Periode,
  ): Promise<InterventionsParStatut[]> {
    return this.depot.compterInterventionsParTechnicienEtStatut(validerPeriode(periode));
  }

  async detaillerTournee(idTechnicien: number, date: string): Promise<TourneeDetaillee | null> {
    return this.depot.detaillerTournee(validerIdentifiant(idTechnicien), validerDate(date));
  }

  async calculerTempsMoyenDeTraitement(periode: Periode): Promise<TempsMoyenDeTraitement> {
    return this.depot.calculerTempsMoyenDeTraitement(validerPeriode(periode));
  }
}
