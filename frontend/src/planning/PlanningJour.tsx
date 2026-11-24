import type { DateIso, Indisponibilite, Intervention, TechnicienDuPlanning } from '../api/types';
import {
  HEURE_FERMETURE,
  HEURE_OUVERTURE,
  jourMetier,
  libelleJourLong,
  minutesDansLaJournee,
} from '../commun/dates';
import { BoutonAffecter } from './BoutonAffecter';
import { BadgesIntervention } from './BadgesIntervention';
import { CelluleIndisponibilite } from './CelluleIndisponibilite';
import type { CaseAAffecter } from './modele';
import { indisponibilitesDuJour, tourneeDuJour } from './modele';
import { couleurTechnicien, creneau, nomComplet } from './presentation';

const DEBUT_JOURNEE_MIN = HEURE_OUVERTURE * 60;
const DUREE_JOURNEE_MIN = (HEURE_FERMETURE - HEURE_OUVERTURE) * 60;
const HEURES = Array.from(
  { length: HEURE_FERMETURE - HEURE_OUVERTURE + 1 },
  (_, rang) => HEURE_OUVERTURE + rang,
);

/** Position horizontale (en %) d'une plage horaire sur la frise 7 h – 19 h. */
function placement(debutMin: number, finMin: number): { left: string; width: string } {
  const debut = Math.max(debutMin, DEBUT_JOURNEE_MIN) - DEBUT_JOURNEE_MIN;
  const fin = Math.min(finMin, DEBUT_JOURNEE_MIN + DUREE_JOURNEE_MIN) - DEBUT_JOURNEE_MIN;
  return {
    left: `${(debut / DUREE_JOURNEE_MIN) * 100}%`,
    width: `${(Math.max(fin - debut, 0) / DUREE_JOURNEE_MIN) * 100}%`,
  };
}

function placementIndisponibilite(jour: DateIso, { debut, fin }: Indisponibilite) {
  // Une indisponibilité commencée la veille ou finie le lendemain couvre le bord de la frise.
  const debutMin = jourMetier(debut) < jour ? 0 : minutesDansLaJournee(debut);
  const finMin = jourMetier(fin) > jour ? 24 * 60 : minutesDansLaJournee(fin);
  return placement(debutMin, finMin);
}

interface Props {
  jour: DateIso;
  techniciens: TechnicienDuPlanning[];
  onAffecter: (caseAAffecter: CaseAAffecter) => void;
}

/** US23 : la journée de chaque technicien sur une frise horaire, pour repérer les créneaux libres. */
export function PlanningJour({ jour, techniciens, onAffecter }: Props) {
  return (
    <section
      aria-label={`Planning du ${libelleJourLong(jour)}`}
      className="overflow-x-auto rounded border border-bordure bg-white"
    >
      <div className="min-w-[960px]">
        <div className="grid grid-cols-[12rem_1fr_7rem] border-b border-bordure bg-fond text-xs font-semibold uppercase tracking-wide text-gris-texte">
          <span className="px-3 py-2">Technicien</span>
          <div className="relative h-8" aria-hidden="true">
            {HEURES.map((heure) => (
              <span
                key={heure}
                className={`absolute top-2 whitespace-nowrap tabular-nums ${
                  heure === HEURE_FERMETURE ? '-translate-x-full' : '-translate-x-1/2'
                }`}
                style={{ left: placement(heure * 60, heure * 60).left }}
              >
                {heure} h
              </span>
            ))}
          </div>
          <span className="sr-only">Actions</span>
        </div>
        {techniciens.map((technicien) => (
          <LigneJournee
            key={technicien.id}
            jour={jour}
            technicien={technicien}
            onAffecter={onAffecter}
          />
        ))}
      </div>
    </section>
  );
}

interface PropsLigne {
  jour: DateIso;
  technicien: TechnicienDuPlanning;
  onAffecter: (caseAAffecter: CaseAAffecter) => void;
}

function LigneJournee({ jour, technicien, onAffecter }: PropsLigne) {
  const couleur = couleurTechnicien(technicien.couleurPlanning);
  const tournee = tourneeDuJour(technicien, jour);
  const indisponibilites = indisponibilitesDuJour(technicien, jour);
  const interventions = tournee?.interventions ?? [];
  const sansCreneau = interventions.filter((intervention) => !intervention.debutPrevu);

  return (
    <div className="grid grid-cols-[12rem_1fr_7rem] items-stretch border-b border-bordure last:border-b-0">
      <h3 className="flex items-center gap-2 px-3 py-3 font-sans text-sm font-semibold">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: couleur }}
        />
        {nomComplet(technicien)}
        <span className="ml-auto text-xs font-normal text-gris-texte">
          {interventions.length} interv.
        </span>
      </h3>
      <div className="relative min-h-20 border-l border-bordure">
        {HEURES.map((heure) => (
          <span
            key={heure}
            aria-hidden="true"
            className="absolute inset-y-0 border-l border-dashed border-bordure"
            style={{ left: placement(heure * 60, heure * 60).left }}
          />
        ))}
        {indisponibilites.map((indisponibilite) => (
          <div
            key={indisponibilite.id}
            className="absolute inset-y-1 overflow-hidden"
            style={placementIndisponibilite(jour, indisponibilite)}
          >
            <CelluleIndisponibilite indisponibilite={indisponibilite} />
          </div>
        ))}
        <ol aria-label={`Tournée de ${nomComplet(technicien)}`}>
          {interventions.map(
            (intervention) =>
              intervention.debutPrevu &&
              intervention.finPrevue && (
                <BlocIntervention
                  key={intervention.id}
                  intervention={intervention}
                  debut={intervention.debutPrevu}
                  fin={intervention.finPrevue}
                  couleur={couleur}
                />
              ),
          )}
        </ol>
        {sansCreneau.length > 0 && (
          <p className="absolute bottom-1 left-1 text-xs text-chantier">
            {sansCreneau.length} intervention(s) sans horaire
          </p>
        )}
      </div>
      <div className="flex items-center border-l border-bordure px-2">
        <BoutonAffecter
          libelleAccessible={`Affecter une intervention à ${nomComplet(technicien)} le ${libelleJourLong(jour)}`}
          onClick={() => onAffecter({ technicien, jour, tournee })}
        />
      </div>
    </div>
  );
}

interface PropsBloc {
  intervention: Intervention;
  debut: string;
  fin: string;
  couleur: string;
}

function BlocIntervention({ intervention, debut, fin, couleur }: PropsBloc) {
  const position = placement(minutesDansLaJournee(debut), minutesDansLaJournee(fin));
  return (
    <li
      className="absolute inset-y-1 overflow-hidden rounded border border-bordure border-l-[3px] bg-white px-1.5 py-1 text-xs shadow-[0_1px_2px_rgb(31_41_55/0.06)]"
      style={{ ...position, borderLeftColor: couleur }}
      title={`${creneau(intervention)} · ${intervention.client.nomAffiche} · ${intervention.type.libelle}`}
    >
      <p className="font-semibold tabular-nums">
        <span className="sr-only">Étape {intervention.ordreTournee} : </span>
        {creneau(intervention)}
      </p>
      <p className="truncate">{intervention.client.nomAffiche}</p>
      <p className="truncate text-gris-texte">{intervention.adresse.ville}</p>
      <div className="mt-0.5 hidden xl:block">
        <BadgesIntervention intervention={intervention} />
      </div>
    </li>
  );
}
