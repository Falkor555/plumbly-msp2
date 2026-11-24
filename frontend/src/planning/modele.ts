import type { DateIso, Indisponibilite, TechnicienDuPlanning } from '../api/types';
import { periodeTouche } from '../commun/dates';

export type TourneeDuPlanning = TechnicienDuPlanning['tournees'][number];

/** Ce qu'il faut pour affecter une intervention : un technicien, un jour, sa tournée s'il en a une. */
export interface CaseAAffecter {
  technicien: TechnicienDuPlanning;
  jour: DateIso;
  tournee: TourneeDuPlanning | null;
}

export function tourneeDuJour(
  technicien: TechnicienDuPlanning,
  jour: DateIso,
): TourneeDuPlanning | null {
  return technicien.tournees.find((tournee) => tournee.dateTournee === jour) ?? null;
}

export function indisponibilitesDuJour(
  technicien: TechnicienDuPlanning,
  jour: DateIso,
): Indisponibilite[] {
  return technicien.indisponibilites.filter(({ debut, fin }) => periodeTouche(jour, debut, fin));
}
