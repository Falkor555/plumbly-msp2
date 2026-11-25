import type { DateIso, Intervention, TechnicienDuPlanning } from '../api/types';
import { libelleJourCourt, libelleJourLong } from '../commun/dates';
import { BoutonAffecter } from './BoutonAffecter';
import { CarteIntervention } from './CarteIntervention';
import { CelluleIndisponibilite } from './CelluleIndisponibilite';
import type { CaseAAffecter } from './modele';
import { indisponibilitesDuJour, tourneeDuJour } from './modele';
import { couleurTechnicien, nomComplet } from './presentation';

/*
 * La colonne des techniciens reste visible pendant le défilement horizontal. Avec
 * border-collapse, la bordure d'une cellule fixe défile avec le tableau : une ombre la remplace.
 */
const COLONNE_FIXE = 'sticky left-0 z-10 shadow-[1px_0_0_var(--color-bordure)]';

interface Props {
  jours: DateIso[];
  techniciens: TechnicienDuPlanning[];
  aujourdhui: DateIso;
  onAffecter: (caseAAffecter: CaseAAffecter) => void;
  onOuvrirIntervention: (intervention: Intervention) => void;
  onOuvrirJour: (jour: DateIso) => void;
}

/** US23 : une ligne par technicien, une colonne par jour ouvré (lundi à samedi). */
export function PlanningSemaine({
  jours,
  techniciens,
  aujourdhui,
  onAffecter,
  onOuvrirIntervention,
  onOuvrirJour,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bordure bg-white">
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left">
        <caption className="sr-only">Planning de la semaine par technicien</caption>
        <thead>
          <tr className="border-b border-bordure bg-fond">
            <th
              scope="col"
              className={`w-48 bg-fond px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gris-texte ${COLONNE_FIXE}`}
            >
              Technicien
            </th>
            {jours.map((jour) => (
              <th key={jour} scope="col" className="px-2 py-2">
                <button
                  type="button"
                  onClick={() => onOuvrirJour(jour)}
                  aria-label={`Voir le ${libelleJourLong(jour)}`}
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold capitalize ${
                    jour === aujourdhui
                      ? 'bg-sarcelle text-white hover:bg-sarcelle-profonde'
                      : 'text-anthracite hover:bg-sarcelle-claire'
                  }`}
                >
                  {libelleJourCourt(jour)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {techniciens.map((technicien) => (
            <LigneTechnicien
              key={technicien.id}
              technicien={technicien}
              jours={jours}
              onAffecter={onAffecter}
              onOuvrirIntervention={onOuvrirIntervention}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PropsLigne {
  technicien: TechnicienDuPlanning;
  jours: DateIso[];
  onAffecter: (caseAAffecter: CaseAAffecter) => void;
  onOuvrirIntervention: (intervention: Intervention) => void;
}

function LigneTechnicien({ technicien, jours, onAffecter, onOuvrirIntervention }: PropsLigne) {
  const couleur = couleurTechnicien(technicien.couleurPlanning);
  return (
    <tr className="border-b border-bordure align-top last:border-b-0">
      <th scope="row" className={`bg-white px-3 py-2 text-sm font-semibold ${COLONNE_FIXE}`}>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: couleur }}
          />
          {nomComplet(technicien)}
        </span>
      </th>
      {jours.map((jour) => {
        const tournee = tourneeDuJour(technicien, jour);
        const indisponibilites = indisponibilitesDuJour(technicien, jour);
        return (
          <td
            key={jour}
            className={`space-y-1.5 border-l border-bordure px-1.5 py-1.5 ${indisponibilites.length > 0 ? 'bg-gray-50' : ''}`}
          >
            {indisponibilites.map((indisponibilite) => (
              <CelluleIndisponibilite key={indisponibilite.id} indisponibilite={indisponibilite} />
            ))}
            {tournee?.interventions.map((intervention) => (
              <CarteIntervention
                key={intervention.id}
                intervention={intervention}
                couleur={couleur}
                onOuvrir={onOuvrirIntervention}
              />
            ))}
            <BoutonAffecter
              libelleAccessible={`Affecter une intervention à ${nomComplet(technicien)} le ${libelleJourLong(jour)}`}
              onClick={() => onAffecter({ technicien, jour, tournee })}
            />
          </td>
        );
      })}
    </tr>
  );
}
