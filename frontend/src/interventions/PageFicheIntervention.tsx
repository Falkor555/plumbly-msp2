import { type FormEvent, type ReactNode, useCallback, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ErreurApi } from '../api/erreurs';
import { interventionsApi } from '../api/interventions.api';
import type { Intervention, TypeIntervention } from '../api/types';
import { typesInterventionApi } from '../api/typesIntervention.api';
import { dateMetierCourte } from '../commun/dates';
import { lienTelephone } from '../commun/liens';
import { messageErreur } from '../commun/messageErreur';
import { useChargement } from '../commun/useChargement';
import { BadgesIntervention } from '../planning/BadgesIntervention';
import { creneau, LIBELLES_STATUT, nomComplet } from '../planning/presentation';
import { ChampsDemande } from './ChampsDemande';
import { FenetreAnnulation } from './FenetreAnnulation';
import {
  depuisIntervention,
  erreursDeLaSaisie,
  type Saisie,
  STATUTS_ANNULABLES,
  STATUTS_MODIFIABLES,
  versModification,
} from './saisie';

const BOUTON_PRINCIPAL =
  'inline-flex h-11 items-center rounded bg-sarcelle px-4 text-sm font-semibold text-white hover:bg-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50';
const BOUTON_SECONDAIRE =
  'inline-flex h-11 items-center rounded border border-gray-300 bg-white px-4 text-sm font-semibold text-sarcelle-profonde hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';
const BOUTON_DANGER =
  'inline-flex h-11 items-center rounded border border-erreur/40 bg-white px-4 text-sm font-semibold text-erreur-texte hover:bg-erreur-fond focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';
const CARTE = 'space-y-3 rounded-lg border border-bordure bg-white p-4';

/** Filtres de la liste d'où l'on vient : le retour les retrouve (US15). */
export interface EtatRetourListe {
  retourListe: string;
}

interface DonneesFiche {
  intervention: Intervention;
  types: TypeIntervention[];
}

/**
 * US16 : fiche d'une intervention pour le bureau, avec sa modification (description, urgence,
 * durée, type) et son annulation. Les boutons suivent les règles du cycle de vie (RG05, RG06,
 * RG15) ; l'API les vérifie de nouveau et garde le dernier mot.
 */
export function PageFicheIntervention() {
  const { id } = useParams();
  const numero = Number(id);
  const retour = (useLocation().state as EtatRetourListe | null)?.retourListe ?? '';
  const charger = useCallback(
    async (signal: AbortSignal): Promise<DonneesFiche> => {
      // Une adresse saisie à la main (/interventions/abc) ne part pas à l'API.
      if (!Number.isInteger(numero) || numero <= 0) throw new ErreurApi(404, []);
      const [intervention, types] = await Promise.all([
        interventionsApi.consulter(numero, signal),
        typesInterventionApi.lister(signal),
      ]);
      return { intervention, types };
    },
    [numero],
  );
  const { etat, recharger } = useChargement(charger);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-8">
      <Link
        to={`/interventions${retour}`}
        className="inline-flex h-11 items-center text-sm font-semibold text-sarcelle-profonde underline"
      >
        Retour à la liste
      </Link>

      {etat.statut === 'chargement' && (
        <p className="text-sm text-gris-texte">Chargement de l’intervention…</p>
      )}
      {etat.statut === 'erreur' && (
        <div
          role="alert"
          className="space-y-2 rounded border border-erreur/30 bg-erreur-fond px-4 py-3 text-sm text-erreur-texte"
        >
          <p>{etat.message}</p>
          <button type="button" onClick={recharger} className="h-11 font-semibold underline">
            Réessayer
          </button>
        </div>
      )}
      {etat.statut === 'pret' && (
        <Fiche
          key={etat.donnees.intervention.id}
          initiale={etat.donnees.intervention}
          types={etat.donnees.types}
        />
      )}
    </main>
  );
}

interface PropsFiche {
  initiale: Intervention;
  types: TypeIntervention[];
}

function Fiche({ initiale, types }: PropsFiche) {
  const [intervention, setIntervention] = useState(initiale);
  const [enModification, setEnModification] = useState(false);
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const modifiable = STATUTS_MODIFIABLES.includes(intervention.statut);
  const annulable = STATUTS_ANNULABLES.includes(intervention.statut);

  function apresModification(miseAJour: Intervention): void {
    setIntervention(miseAJour);
    setEnModification(false);
    setMessage('Modifications enregistrées.');
  }

  function apresAnnulation(annulee: Intervention): void {
    setIntervention(annulee);
    setAnnulationOuverte(false);
    setMessage('Intervention annulée.');
  }

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {intervention.type.libelle} · {intervention.client.nomAffiche}
        </h1>
        <BadgesIntervention intervention={intervention} />
      </header>

      {message && (
        <p
          role="status"
          className="rounded border border-sarcelle/30 bg-sarcelle-claire px-4 py-3 text-sm font-medium text-sarcelle-profonde"
        >
          {message}
        </p>
      )}

      {enModification ? (
        <FormulaireModification
          intervention={intervention}
          types={types}
          onEnregistree={apresModification}
          onAbandon={() => setEnModification(false)}
        />
      ) : (
        <>
          <Details intervention={intervention} />
          <div className="flex flex-wrap items-center gap-2">
            {modifiable && (
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setEnModification(true);
                }}
                className={BOUTON_PRINCIPAL}
              >
                Modifier
              </button>
            )}
            {annulable && (
              <button
                type="button"
                onClick={() => setAnnulationOuverte(true)}
                className={BOUTON_DANGER}
              >
                Annuler l’intervention
              </button>
            )}
            <p className="text-sm text-gris-texte">{restriction(intervention)}</p>
          </div>
        </>
      )}

      {annulationOuverte && (
        <FenetreAnnulation
          intervention={intervention}
          onAnnulee={apresAnnulation}
          onFermer={() => setAnnulationOuverte(false)}
        />
      )}
    </>
  );
}

/** Pourquoi un bouton manque : le gestionnaire n'a pas à deviner la règle (RG05, RG06, RG15). */
function restriction({ statut }: Intervention): string {
  if (statut === 'EN_COURS') {
    return 'En cours : elle ne se modifie plus, mais peut encore être annulée.';
  }
  if (statut === 'TERMINEE' || statut === 'ANNULEE') {
    return `Cette intervention est ${LIBELLES_STATUT[statut].toLowerCase()} : elle ne se modifie plus.`;
  }
  return '';
}

function Details({ intervention }: { intervention: Intervention }) {
  const { client, adresse, tournee } = intervention;
  return (
    <dl className={`${CARTE} grid gap-x-6 text-sm sm:grid-cols-2`}>
      <Rubrique titre="Client">
        {client.nomAffiche}
        <a
          href={lienTelephone(client.telephone)}
          className="block font-semibold text-sarcelle-profonde underline"
        >
          {client.telephone}
        </a>
      </Rubrique>
      <Rubrique titre="Adresse">
        <address className="not-italic">
          {adresse.rue}
          {adresse.complement && <span className="block">{adresse.complement}</span>}
          <span className="block">
            {adresse.codePostal} {adresse.ville}
          </span>
        </address>
      </Rubrique>
      {adresse.infosAcces && <Rubrique titre="Accès">{adresse.infosAcces}</Rubrique>}
      <Rubrique titre="Créneau">
        {intervention.debutPrevu
          ? `${dateMetierCourte(intervention.debutPrevu)} · ${creneau(intervention)}`
          : 'Non planifiée'}
      </Rubrique>
      <Rubrique titre="Technicien">
        {tournee ? nomComplet(tournee.technicien) : 'Non affectée'}
      </Rubrique>
      <Rubrique titre="Durée estimée">{intervention.dureeEstimeeMin} min</Rubrique>
      <Rubrique titre="Créée par">
        {nomComplet(intervention.createur)}, le {dateMetierCourte(intervention.creeLe)}
      </Rubrique>
      <div className="sm:col-span-2">
        <Rubrique titre="Description">
          <span className="whitespace-pre-line">{intervention.description}</span>
        </Rubrique>
      </div>
      {intervention.motifAnnulation && (
        <div className="sm:col-span-2">
          <Rubrique titre="Motif de l’annulation">{intervention.motifAnnulation}</Rubrique>
        </div>
      )}
      {intervention.compteRendu && (
        <div className="sm:col-span-2">
          <Rubrique titre="Compte rendu">
            <span className="whitespace-pre-line">{intervention.compteRendu}</span>
          </Rubrique>
        </div>
      )}
    </dl>
  );
}

function Rubrique({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <dt className="font-semibold">{titre}</dt>
      <dd className="text-anthracite">{children}</dd>
    </div>
  );
}

interface PropsModification {
  intervention: Intervention;
  types: TypeIntervention[];
  onEnregistree: (intervention: Intervention) => void;
  onAbandon: () => void;
}

function FormulaireModification({
  intervention,
  types,
  onEnregistree,
  onAbandon,
}: PropsModification) {
  const [saisie, setSaisie] = useState<Saisie>(() => depuisIntervention(intervention));
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);

  async function enregistrer(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    if (envoi) return;
    const trouvees = erreursDeLaSaisie(saisie);
    setErreurs(trouvees);
    if (trouvees.length > 0) return;
    const modification = versModification(saisie, intervention);
    if (Object.keys(modification).length === 0) {
      setErreurs(['Aucune modification à enregistrer.']);
      return;
    }
    setEnvoi(true);
    try {
      onEnregistree(await interventionsApi.modifier(intervention.id, modification));
    } catch (erreur) {
      setErreurs([messageErreur(erreur, 'Modification d’une intervention')]);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={enregistrer} aria-label="Modifier l’intervention" noValidate className={CARTE}>
      <ChampsDemande types={types} saisie={saisie} onSaisie={setSaisie} />

      {erreurs.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-erreur-texte">
          {erreurs.map((erreur) => (
            <li key={erreur} className="whitespace-pre-line">
              {erreur}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={envoi} className={BOUTON_PRINCIPAL}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" onClick={onAbandon} className={BOUTON_SECONDAIRE}>
          Abandonner
        </button>
      </div>
    </form>
  );
}
