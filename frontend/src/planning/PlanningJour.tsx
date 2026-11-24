import type {
  DateIso,
  Indisponibilite,
  Intervention,
  StatutIntervention,
  TechnicienDuPlanning,
} from '../api/types';
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
import {
  CLASSES_BLOC_STATUT,
  couleurTechnicien,
  creneau,
  LIBELLES_STATUT,
  nombreDInterventions,
  nomComplet,
} from './presentation';

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

/** Libellé d'heure de la frise, au même format que les créneaux : « 08:00 ». */
function libelleHeure(heure: number): string {
  return `${String(heure).padStart(2, '0')}:00`;
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
      className="overflow-hidden rounded-lg border border-bordure bg-white"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <div className="grid grid-cols-[12rem_1fr_7rem] border-b border-bordure bg-fond text-xs font-semibold uppercase tracking-wide text-gris-texte">
            <span className="sticky left-0 z-20 border-r border-bordure bg-fond px-3 py-3">
              Technicien
            </span>
            <div className="relative h-10" aria-hidden="true">
              {HEURES.map((heure) => (
                <span
                  key={heure}
                  className={`absolute top-3 whitespace-nowrap tabular-nums ${
                    heure === HEURE_FERMETURE ? '-translate-x-full' : '-translate-x-1/2'
                  }`}
                  style={{ left: placement(heure * 60, heure * 60).left }}
                >
                  {libelleHeure(heure)}
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
      </div>
      <LegendeStatuts />
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
      <h3 className="sticky left-0 z-20 flex items-center gap-2 border-r border-bordure bg-white px-3 py-3 font-sans text-sm font-semibold">
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
      <div className="relative min-h-24">
        {HEURES.map((heure) => (
          <span
            key={heure}
            aria-hidden="true"
            className="absolute inset-y-0 border-l border-gray-100"
            style={{ left: placement(heure * 60, heure * 60).left }}
          />
        ))}
        {indisponibilites.map((indisponibilite) => (
          <div
            key={indisponibilite.id}
            className="absolute inset-y-2 overflow-hidden"
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
            {nombreDInterventions(sansCreneau.length)} sans horaire
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
  const { client, adresse, type } = intervention;
  return (
    <li
      className={`absolute inset-y-2 overflow-hidden rounded border border-bordure border-l-[3px] px-1.5 py-1 text-xs shadow-[0_1px_2px_rgb(31_41_55/0.06)] ${CLASSES_BLOC_STATUT[intervention.statut]}`}
      style={{ ...position, borderLeftColor: couleur }}
      title={`${creneau(intervention)} · ${client.nomAffiche} · ${type.libelle} · ${adresse.ville}`}
    >
      <p className="font-semibold tabular-nums">
        <span className="sr-only">Étape {intervention.ordreTournee} : </span>
        {creneau(intervention)}
      </p>
      <p className="truncate font-medium">{type.libelle}</p>
      <p className="truncate text-gris-texte">
        {client.nomAffiche}
        <span className="sr-only">, {adresse.ville}</span>
      </p>
      {/* Faute de place sous xl, le badge n'est pas affiché mais reste lu par les lecteurs d'écran. */}
      <div className="sr-only mt-0.5 xl:not-sr-only">
        <BadgesIntervention intervention={intervention} />
      </div>
    </li>
  );
}

const STATUTS_LEGENDE: StatutIntervention[] = ['PLANIFIEE', 'EN_COURS', 'TERMINEE'];

function LegendeStatuts() {
  return (
    <ul
      aria-label="Légende des statuts"
      className="flex flex-wrap items-center gap-4 border-t border-bordure bg-fond px-3 py-2 text-xs text-gris-texte"
    >
      {STATUTS_LEGENDE.map((statut) => (
        <li key={statut} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`size-3 rounded-sm border border-bordure ${CLASSES_BLOC_STATUT[statut]}`}
          />
          {LIBELLES_STATUT[statut]}
        </li>
      ))}
    </ul>
  );
}
