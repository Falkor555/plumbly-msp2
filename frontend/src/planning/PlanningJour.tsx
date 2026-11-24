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
import { CelluleIndisponibilite } from './CelluleIndisponibilite';
import type { CaseAAffecter } from './modele';
import { indisponibilitesDuJour, tourneeDuJour } from './modele';
import {
  CLASSES_BLOC_STATUT,
  couleurTechnicien,
  creneau,
  LIBELLES_STATUT,
  LIBELLES_URGENCE,
  nombreDInterventions,
  nomComplet,
} from './presentation';

const DEBUT_JOURNEE_MIN = HEURE_OUVERTURE * 60;
const DUREE_JOURNEE_MIN = (HEURE_FERMETURE - HEURE_OUVERTURE) * 60;
const HEURES = Array.from(
  { length: HEURE_FERMETURE - HEURE_OUVERTURE + 1 },
  (_, rang) => HEURE_OUVERTURE + rang,
);

/*
 * Marge de chaque côté de la frise, la même dans l'en-tête et dans les lignes : les libellés
 * 07:00 et 19:00 restent centrés sur leur trait sans passer sous la colonne fixe.
 */
const MARGE_FRISE = 'px-6';

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
  onOuvrirIntervention: (intervention: Intervention) => void;
}

/** US23 : la journée de chaque technicien sur une frise horaire, pour repérer les créneaux libres. */
export function PlanningJour({ jour, techniciens, onAffecter, onOuvrirIntervention }: Props) {
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
            <div className={MARGE_FRISE} aria-hidden="true">
              <div className="relative h-10">
                {HEURES.map((heure) => (
                  <span
                    key={heure}
                    className="absolute top-3 -translate-x-1/2 whitespace-nowrap tabular-nums"
                    style={{ left: placement(heure * 60, heure * 60).left }}
                  >
                    {libelleHeure(heure)}
                  </span>
                ))}
              </div>
            </div>
            <span className="sr-only">Actions</span>
          </div>
          {techniciens.map((technicien) => (
            <LigneJournee
              key={technicien.id}
              jour={jour}
              technicien={technicien}
              onAffecter={onAffecter}
              onOuvrirIntervention={onOuvrirIntervention}
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
  onOuvrirIntervention: (intervention: Intervention) => void;
}

function LigneJournee({ jour, technicien, onAffecter, onOuvrirIntervention }: PropsLigne) {
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
      <div className={MARGE_FRISE}>
        <FriseDuTechnicien
          jour={jour}
          technicien={technicien}
          interventions={interventions}
          indisponibilites={indisponibilites}
          nombreSansCreneau={sansCreneau.length}
          onOuvrirIntervention={onOuvrirIntervention}
        />
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

interface PropsFrise {
  jour: DateIso;
  technicien: TechnicienDuPlanning;
  interventions: Intervention[];
  indisponibilites: Indisponibilite[];
  nombreSansCreneau: number;
  onOuvrirIntervention: (intervention: Intervention) => void;
}

function FriseDuTechnicien({
  jour,
  technicien,
  interventions,
  indisponibilites,
  nombreSansCreneau,
  onOuvrirIntervention,
}: PropsFrise) {
  const couleur = couleurTechnicien(technicien.couleurPlanning);
  return (
    <div className="relative h-full min-h-24">
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
                onOuvrir={onOuvrirIntervention}
              />
            ),
        )}
      </ol>
      {nombreSansCreneau > 0 && (
        <p className="absolute bottom-1 left-1 text-xs text-chantier">
          {nombreDInterventions(nombreSansCreneau)} sans horaire
        </p>
      )}
    </div>
  );
}

interface PropsBloc {
  intervention: Intervention;
  debut: string;
  fin: string;
  couleur: string;
  onOuvrir: (intervention: Intervention) => void;
}

function BlocIntervention({ intervention, debut, fin, couleur, onOuvrir }: PropsBloc) {
  const position = placement(minutesDansLaJournee(debut), minutesDansLaJournee(fin));
  const { client, adresse, type } = intervention;
  const urgente = intervention.urgence !== 'NORMALE';
  return (
    <li
      className={`absolute inset-y-2 rounded border border-bordure border-l-[3px] text-xs shadow-[0_1px_2px_rgb(31_41_55/0.06)] ${CLASSES_BLOC_STATUT[intervention.statut]}`}
      style={{ ...position, borderLeftColor: couleur }}
      title={`${creneau(intervention)} · ${client.nomAffiche} · ${type.libelle} · ${adresse.ville}`}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOuvrir(intervention)}
        className={`relative block size-full overflow-hidden rounded-r py-1 pl-1.5 text-left hover:bg-black/3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle ${urgente ? 'pr-4' : 'pr-1.5'}`}
      >
        {urgente && <RepereUrgence libelle={LIBELLES_URGENCE[intervention.urgence]} />}
        <span className="block font-semibold tabular-nums">
          <span className="sr-only">Étape {intervention.ordreTournee} : </span>
          {creneau(intervention)}
        </span>
        <span className="block truncate font-medium">{type.libelle}</span>
        <span className="block truncate text-gris-texte">
          {client.nomAffiche}
          <span className="sr-only">, {adresse.ville}</span>
        </span>
        {/*
         * Les badges rogneraient dans un bloc étroit : le statut est porté par le style du bloc
         * et l'urgence par le repère orange. Les lecteurs d'écran lisent le statut et le retard.
         */}
        <span className="sr-only">
          , {LIBELLES_STATUT[intervention.statut]}
          {intervention.enRetard && ', En retard'}
        </span>
      </button>
    </li>
  );
}

function RepereUrgence({ libelle }: { libelle: string }) {
  return (
    <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-chantier">
      <span className="sr-only">{libelle}</span>
    </span>
  );
}

const STATUTS_LEGENDE: StatutIntervention[] = ['PLANIFIEE', 'EN_COURS', 'TERMINEE', 'ANNULEE'];

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
          <span className={statut === 'ANNULEE' ? 'line-through' : undefined}>
            {LIBELLES_STATUT[statut]}
          </span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-chantier" />
        Urgente ou prioritaire
      </li>
    </ul>
  );
}
