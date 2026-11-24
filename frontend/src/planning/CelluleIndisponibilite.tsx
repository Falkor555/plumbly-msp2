import type { Indisponibilite } from '../api/types';
import { dateMetierCourte, heureMetier, jourMetier } from '../commun/dates';

function periode({ debut, fin }: Indisponibilite): string {
  if (jourMetier(debut) === jourMetier(fin)) return `${heureMetier(debut)}–${heureMetier(fin)}`;
  return `du ${dateMetierCourte(debut)} ${heureMetier(debut)} au ${dateMetierCourte(fin)} ${heureMetier(fin)}`;
}

/** Indisponibilité (congé, formation…) grisée dans le planning (US13). */
export function CelluleIndisponibilite({ indisponibilite }: { indisponibilite: Indisponibilite }) {
  return (
    <p className="rounded bg-gray-100 px-2 py-1 text-xs text-gris-texte">
      <span className="font-semibold">Indisponible</span>
      {indisponibilite.motif ? ` · ${indisponibilite.motif}` : ''}
      <span className="block tabular-nums">{periode(indisponibilite)}</span>
    </p>
  );
}
