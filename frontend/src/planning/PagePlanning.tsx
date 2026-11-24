import { useCallback, useState } from 'react';
import { tourneesApi } from '../api/tournees.api';
import type { DateIso, Intervention, Planning } from '../api/types';
import { jourMetier, joursOuvres, libelleJourChiffres, libelleJourLong } from '../commun/dates';
import { useChargement } from '../commun/useChargement';
import { BarrePlanning } from './BarrePlanning';
import { FenetreAffectation } from './FenetreAffectation';
import { FenetreDetailIntervention } from './FenetreDetailIntervention';
import type { CaseAAffecter } from './modele';
import { deplacer, periodeAffichee, type Vue } from './navigation';
import { PlanningJour } from './PlanningJour';
import { PlanningSemaine } from './PlanningSemaine';

interface Props {
  /** Jour de La Réunion à afficher au départ ; aujourd'hui par défaut. Fixé dans les tests. */
  aujourdhui?: DateIso;
}

function titre(vue: Vue, du: DateIso, au: DateIso): string {
  if (vue === 'jour') return libelleJourLong(du);
  return `Semaine du ${libelleJourChiffres(du)} au ${libelleJourChiffres(au)}`;
}

/** US23 : planning jour / semaine des techniciens, pour le gestionnaire. */
export function PagePlanning({ aujourdhui = jourMetier(new Date()) }: Props) {
  const [vue, setVue] = useState<Vue>('semaine');
  const [jour, setJour] = useState<DateIso>(aujourdhui);
  const [technicienId, setTechnicienId] = useState<number | null>(null);
  const [caseAAffecter, setCaseAAffecter] = useState<CaseAAffecter | null>(null);
  const [interventionDetaillee, setInterventionDetaillee] = useState<Intervention | null>(null);
  const fermerDetail = useCallback(() => setInterventionDetaillee(null), []);

  const { du, au } = periodeAffichee(vue, jour);
  const chargerPlanning = useCallback(
    (signal: AbortSignal) => tourneesApi.consulterPlanning({ du, au }, signal),
    [du, au],
  );
  const { etat, recharger } = useChargement<Planning>(chargerPlanning);

  // Le filtre s'applique à l'écran : la liste du sélecteur garde ainsi tous les techniciens.
  const techniciens = etat.statut === 'pret' ? etat.donnees.techniciens : [];
  const techniciensAffiches =
    technicienId === null ? techniciens : techniciens.filter(({ id }) => id === technicienId);

  const fermerAffectation = useCallback(
    (planningModifie: boolean) => {
      setCaseAAffecter(null);
      if (planningModifie) recharger();
    },
    [recharger],
  );

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 md:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Planning</h1>
        <p className="text-sm text-gris-texte">Tournées des techniciens, heure de La Réunion.</p>
      </header>

      <BarrePlanning
        titrePeriode={titre(vue, du, au)}
        vue={vue}
        onChangerVue={setVue}
        onPrecedent={() => setJour(deplacer(vue, jour, -1))}
        onSuivant={() => setJour(deplacer(vue, jour, 1))}
        onAujourdhui={() => setJour(aujourdhui)}
        techniciens={techniciens}
        technicienId={technicienId}
        onFiltrer={setTechnicienId}
      />

      {etat.statut === 'chargement' && (
        <p className="text-sm text-gris-texte">Chargement du planning…</p>
      )}
      {etat.statut === 'erreur' && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded border border-erreur/30 bg-red-50 px-4 py-3 text-sm text-erreur"
        >
          {etat.message}
          <button type="button" onClick={recharger} className="ml-auto font-semibold underline">
            Réessayer
          </button>
        </div>
      )}
      {etat.statut === 'pret' && techniciens.length === 0 && (
        <p className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte">
          Aucun technicien actif.
        </p>
      )}
      {etat.statut === 'pret' &&
        techniciens.length > 0 &&
        (vue === 'semaine' ? (
          <PlanningSemaine
            jours={joursOuvres(du)}
            techniciens={techniciensAffiches}
            aujourdhui={aujourdhui}
            onAffecter={setCaseAAffecter}
            onOuvrirIntervention={setInterventionDetaillee}
            onOuvrirJour={(jourChoisi) => {
              setJour(jourChoisi);
              setVue('jour');
            }}
          />
        ) : (
          <PlanningJour
            jour={du}
            techniciens={techniciensAffiches}
            onAffecter={setCaseAAffecter}
            onOuvrirIntervention={setInterventionDetaillee}
          />
        ))}

      {interventionDetaillee && (
        <FenetreDetailIntervention intervention={interventionDetaillee} onFermer={fermerDetail} />
      )}

      {caseAAffecter && (
        <FenetreAffectation caseAAffecter={caseAAffecter} onFermer={fermerAffectation} />
      )}
    </main>
  );
}
