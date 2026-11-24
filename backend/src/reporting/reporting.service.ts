import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportingRepository } from './reporting.repository.js';
import type {
  InterventionsParStatut,
  Periode,
  TempsMoyenDeTraitement,
  TourneeDetaillee,
} from './reporting.types.js';

const FORMAT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

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

export function validerDate(date: string): string {
  const morceaux = FORMAT_DATE.exec(date);
  if (morceaux === null || !estUnJourDuCalendrier(morceaux)) {
    throw new BadRequestException('Date invalide : format attendu AAAA-MM-JJ.');
  }
  return date;
}

/** Rejette les dates bien formées mais inexistantes, comme le 30 février. */
function estUnJourDuCalendrier([, annee, mois, jour]: RegExpExecArray): boolean {
  const date = new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
  return (
    date.getUTCFullYear() === Number(annee) &&
    date.getUTCMonth() === Number(mois) - 1 &&
    date.getUTCDate() === Number(jour)
  );
}

export function validerPeriode({ du, au }: Periode): Periode {
  validerDate(du);
  validerDate(au);
  // Le format AAAA-MM-JJ se compare correctement dans l'ordre alphabétique.
  if (du > au) {
    throw new BadRequestException('Période invalide : la date de début suit la date de fin.');
  }
  return { du, au };
}

export function validerIdentifiant(identifiant: number): number {
  // Les identifiants sont des colonnes integer (SERIAL) de PostgreSQL.
  if (!Number.isInteger(identifiant) || identifiant < 1 || identifiant > 2_147_483_647) {
    throw new BadRequestException('Identifiant invalide.');
  }
  return identifiant;
}
