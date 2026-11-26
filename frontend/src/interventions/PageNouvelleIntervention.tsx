import { type FormEvent, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { interventionsApi } from '../api/interventions.api';
import type { Client, TypeIntervention, Urgence } from '../api/types';
import { typesInterventionApi } from '../api/typesIntervention.api';
import { messageErreur } from '../commun/messageErreur';
import { useChargement } from '../commun/useChargement';
import { LIBELLES_URGENCE } from '../planning/presentation';
import { ChoixClient } from './ChoixClient';
import {
  avecType,
  DUREE_MAX,
  DUREE_MIN,
  erreursDeLaSaisie,
  LONGUEUR_DESCRIPTION_MAX,
  SAISIE_VIDE,
  type Saisie,
  versNouvelleIntervention,
} from './saisie';

const CHAMP =
  'mt-1 block w-full rounded border border-gray-300 bg-white px-3 text-sm text-anthracite focus-visible:border-sarcelle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sarcelle';
const BOUTON_PRINCIPAL =
  'inline-flex h-11 items-center rounded bg-sarcelle px-4 text-sm font-semibold text-white hover:bg-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50';
const BOUTON_SECONDAIRE =
  'inline-flex h-11 items-center rounded border border-gray-300 bg-white px-4 text-sm font-semibold text-sarcelle-profonde hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';
const CARTE = 'space-y-3 rounded-lg border border-bordure bg-white p-4';
/** De la moins à la plus urgente : « Normale », choisie par défaut, vient en premier. */
const URGENCES_DU_FORMULAIRE: readonly Urgence[] = ['NORMALE', 'PRIORITAIRE', 'URGENTE'];

/** Message que la liste affiche après une création (état de navigation, perdu au rechargement). */
export interface EtatApresCreation {
  messageCreation: string;
}

/**
 * US14 : enregistrer la demande d'un client. L'intervention est créée « à planifier » (RG01),
 * puis la liste des interventions à planifier s'ouvre : une urgente y arrive en tête (RG18).
 */
export function PageNouvelleIntervention() {
  const { etat, recharger } = useChargement(typesInterventionApi.lister);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nouvelle intervention</h1>
        <p className="text-sm text-gris-texte">
          Elle sera créée « à planifier », puis affectée à un technicien depuis le planning.
        </p>
      </header>

      {etat.statut === 'chargement' && (
        <p className="text-sm text-gris-texte">Chargement du formulaire…</p>
      )}
      {etat.statut === 'erreur' && (
        <div
          role="alert"
          className="space-y-2 rounded border border-erreur/30 bg-red-50 px-4 py-3 text-sm text-erreur"
        >
          <p>{etat.message}</p>
          <button type="button" onClick={recharger} className="h-11 font-semibold underline">
            Réessayer
          </button>
        </div>
      )}
      {etat.statut === 'pret' && <FormulaireIntervention types={etat.donnees} />}
    </main>
  );
}

function FormulaireIntervention({ types }: { types: TypeIntervention[] }) {
  const id = useId();
  const naviguer = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [saisie, setSaisie] = useState<Saisie>(SAISIE_VIDE);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const modifier = (champs: Partial<Saisie>) =>
    setSaisie((courante) => ({ ...courante, ...champs }));

  function choisirClient(choisi: Client | null): void {
    setClient(choisi);
    // Une seule adresse en service : elle est choisie d'office.
    modifier({ adresseId: choisi?.adresses.length === 1 ? choisi.adresses[0].id : null });
  }

  function choisirType(valeur: string): void {
    const type = types.find((candidat) => String(candidat.id) === valeur);
    setSaisie((courante) => avecType(courante, type));
  }

  async function enregistrer(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    if (envoi) return;
    const trouvees = erreursDeLaSaisie(saisie);
    setErreurs(trouvees);
    if (trouvees.length > 0) return;
    setEnvoi(true);
    try {
      await interventionsApi.creer(versNouvelleIntervention(saisie));
      const etat: EtatApresCreation = {
        messageCreation: `Intervention créée pour ${client?.nomAffiche ?? 'le client'} : elle est à planifier.`,
      };
      naviguer('/interventions?statut=A_PLANIFIER', { state: etat });
    } catch (erreur) {
      setErreurs([messageErreur(erreur, 'Création d’une intervention')]);
      setEnvoi(false);
    }
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby={`${id}-titre-client`} className={CARTE}>
        <h2 id={`${id}-titre-client`} className="text-lg font-semibold">
          1. Client et adresse
        </h2>
        <ChoixClient
          client={client}
          adresseId={saisie.adresseId}
          onClient={choisirClient}
          onAdresse={(adresseId) => modifier({ adresseId })}
        />
      </section>

      {/* noValidate : les erreurs sont toutes affichées ensemble, avec les messages du métier. */}
      <form
        onSubmit={enregistrer}
        aria-labelledby={`${id}-titre-demande`}
        noValidate
        className={CARTE}
      >
        <h2 id={`${id}-titre-demande`} className="text-lg font-semibold">
          2. Demande
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-type`} className="text-sm font-semibold">
              Type d’intervention
            </label>
            <select
              id={`${id}-type`}
              value={saisie.typeInterventionId}
              onChange={(evenement) => choisirType(evenement.target.value)}
              className={`${CHAMP} h-11`}
            >
              <option value="">Choisir un type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-duree`} className="text-sm font-semibold">
              Durée estimée (minutes)
            </label>
            <input
              id={`${id}-duree`}
              type="number"
              inputMode="numeric"
              min={DUREE_MIN}
              max={DUREE_MAX}
              step={5}
              value={saisie.dureeEstimeeMin}
              onChange={(evenement) => modifier({ dureeEstimeeMin: evenement.target.value })}
              aria-describedby={`${id}-aide-duree`}
              className={`${CHAMP} h-11`}
            />
            <p id={`${id}-aide-duree`} className="mt-1 text-xs text-gris-texte">
              Préremplie avec la durée habituelle du type.
            </p>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Urgence</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {URGENCES_DU_FORMULAIRE.map((urgence) => (
              <label
                key={urgence}
                className="flex h-11 cursor-pointer items-center gap-2 rounded border border-bordure px-3 text-sm has-checked:border-sarcelle has-checked:bg-sarcelle-claire"
              >
                <input
                  type="radio"
                  name="urgence"
                  value={urgence}
                  checked={saisie.urgence === urgence}
                  onChange={() => modifier({ urgence })}
                  className="h-4 w-4 accent-sarcelle"
                />
                {LIBELLES_URGENCE[urgence]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${id}-description`} className="text-sm font-semibold">
            Description de la demande
          </label>
          <textarea
            id={`${id}-description`}
            rows={4}
            maxLength={LONGUEUR_DESCRIPTION_MAX}
            value={saisie.description}
            onChange={(evenement) => modifier({ description: evenement.target.value })}
            className={`${CHAMP} py-2`}
          />
          <p className="mt-1 text-right text-xs text-gris-texte">
            {saisie.description.length} / {LONGUEUR_DESCRIPTION_MAX}
          </p>
        </div>

        {erreurs.length > 0 && (
          <ul role="alert" className="space-y-1 text-sm text-erreur">
            {erreurs.map((erreur) => (
              <li key={erreur} className="whitespace-pre-line">
                {erreur}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={envoi} className={BOUTON_PRINCIPAL}>
            {envoi ? 'Création…' : 'Créer l’intervention'}
          </button>
          <Link to="/interventions" className={BOUTON_SECONDAIRE}>
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
