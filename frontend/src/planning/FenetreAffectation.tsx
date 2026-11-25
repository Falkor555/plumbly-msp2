import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { interventionsApi } from '../api/interventions.api';
import { tourneesApi } from '../api/tournees.api';
import type { Intervention } from '../api/types';
import { HEURE_FERMETURE, HEURE_OUVERTURE, libelleJourLong, versInstant } from '../commun/dates';
import { messageErreur } from '../commun/messageErreur';
import { useChargement } from '../commun/useChargement';
import type { CaseAAffecter } from './modele';
import { LIBELLES_URGENCE, nomComplet } from './presentation';

const HEURE_PROPOSEE = '08:00';
const PAS_DE_QUINZE_MINUTES_EN_SECONDES = 900;

function deuxChiffres(nombre: number): string {
  return String(nombre).padStart(2, '0');
}

function libelleOption(intervention: Intervention): string {
  const urgence =
    intervention.urgence === 'NORMALE' ? '' : ` · ${LIBELLES_URGENCE[intervention.urgence]}`;
  return `${intervention.client.nomAffiche} · ${intervention.type.libelle} · ${intervention.adresse.ville} · ${intervention.dureeEstimeeMin} min${urgence}`;
}

interface Props {
  caseAAffecter: CaseAAffecter;
  /** `planningModifie` : une tournée a été créée ou une intervention affectée, le planning doit être relu. */
  onFermer: (planningModifie: boolean) => void;
}

/**
 * US21 : affecte une intervention « à planifier » à la tournée du technicien pour ce jour.
 * Si le technicien n'a pas encore de tournée ce jour-là, elle est créée d'abord (US20).
 * Les conflits (chevauchement, indisponibilité, horaires) sont vérifiés par l'API, qui répond
 * 409 ou 400 avec un message destiné au gestionnaire : on l'affiche tel quel.
 */
export function FenetreAffectation({ caseAAffecter, onFermer }: Props) {
  const { technicien, jour } = caseAAffecter;
  const idTitre = useId();
  const idHeure = useId();
  const idAideHeure = useId();
  const chargerInterventions = useCallback(
    (signal: AbortSignal) => interventionsApi.listerAPlanifier(signal),
    [],
  );
  const { etat } = useChargement(chargerInterventions);

  const [interventionId, setInterventionId] = useState('');
  const [heure, setHeure] = useState(HEURE_PROPOSEE);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Conservée si l'affectation échoue après la création : un nouvel essai ne recrée pas la tournée.
  const [tourneeId, setTourneeId] = useState<number | null>(caseAAffecter.tournee?.id ?? null);
  const tourneeCreeeIci = tourneeId !== null && caseAAffecter.tournee === null;

  useEffect(() => {
    function fermerAvecEchap(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape') onFermer(tourneeCreeeIci);
    }
    document.addEventListener('keydown', fermerAvecEchap);
    return () => document.removeEventListener('keydown', fermerAvecEchap);
  }, [onFermer, tourneeCreeeIci]);

  async function obtenirTournee(): Promise<number> {
    if (tourneeId !== null) return tourneeId;
    const tournee = await tourneesApi.creer({ technicienId: technicien.id, dateTournee: jour });
    setTourneeId(tournee.id);
    return tournee.id;
  }

  async function affecter(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      const idTournee = await obtenirTournee();
      await tourneesApi.affecterIntervention(idTournee, {
        interventionId: Number(interventionId),
        debutPrevu: versInstant(jour, heure),
      });
      onFermer(true);
    } catch (cause) {
      setErreur(messageErreur(cause, 'Affectation impossible'));
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-anthracite/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        className="w-full max-w-lg rounded-xl border border-bordure bg-white shadow-[0_4px_6px_-1px_rgb(31_41_55/0.08),0_2px_4px_-2px_rgb(31_41_55/0.06)]"
      >
        <header className="border-b border-bordure px-6 py-4">
          <h2 id={idTitre} className="text-lg font-semibold">
            Affecter une intervention
          </h2>
          <p className="text-sm text-gris-texte">
            {nomComplet(technicien)} · {libelleJourLong(jour)}
            {caseAAffecter.tournee === null && ' · une tournée sera créée'}
          </p>
        </header>

        <form onSubmit={affecter} className="space-y-4 px-6 py-4">
          {etat.statut === 'chargement' && (
            <p className="text-sm text-gris-texte">Chargement des interventions à planifier…</p>
          )}
          {etat.statut === 'erreur' && (
            <p role="alert" className="text-sm text-erreur">
              {etat.message}
            </p>
          )}
          {etat.statut === 'pret' && etat.donnees.data.length === 0 && (
            <p className="text-sm text-gris-texte">
              Aucune intervention n'attend d'être planifiée.
            </p>
          )}
          {etat.statut === 'pret' && etat.donnees.data.length > 0 && (
            <>
              <label className="block text-xs font-medium">
                Intervention à planifier
                <select
                  required
                  autoFocus
                  value={interventionId}
                  onChange={(evenement) => setInterventionId(evenement.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none"
                >
                  <option value="">Choisir une intervention</option>
                  {etat.donnees.data.map((intervention) => (
                    <option key={intervention.id} value={intervention.id}>
                      {libelleOption(intervention)}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <label htmlFor={idHeure} className="block text-xs font-medium">
                  Heure de début
                </label>
                <input
                  id={idHeure}
                  type="time"
                  required
                  value={heure}
                  min={`${deuxChiffres(HEURE_OUVERTURE)}:00`}
                  max={`${deuxChiffres(HEURE_FERMETURE)}:00`}
                  step={PAS_DE_QUINZE_MINUTES_EN_SECONDES}
                  onChange={(evenement) => setHeure(evenement.target.value)}
                  aria-describedby={idAideHeure}
                  className="mt-1 block w-36 rounded border border-gray-300 px-2 py-2 text-sm tabular-nums focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none"
                />
                <p id={idAideHeure} className="mt-1 text-xs text-gris-texte">
                  Créneaux de {HEURE_OUVERTURE} h à {HEURE_FERMETURE} h, heure de La Réunion.
                </p>
              </div>
            </>
          )}

          {erreur && (
            <p
              role="alert"
              className="rounded border border-erreur/30 bg-red-50 px-3 py-2 text-sm text-erreur"
            >
              {erreur}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onFermer(tourneeCreeeIci)}
              className="h-9 rounded border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={etat.statut !== 'pret' || etat.donnees.data.length === 0 || envoiEnCours}
              className="h-9 rounded bg-sarcelle px-4 text-sm font-semibold text-white hover:bg-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50"
            >
              {envoiEnCours ? 'Affectation…' : 'Affecter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
