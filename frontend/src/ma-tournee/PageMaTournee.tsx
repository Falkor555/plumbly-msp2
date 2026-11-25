import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { interventionsApi } from '../api/interventions.api';
import { tourneesApi } from '../api/tournees.api';
import type { Intervention, StatutIntervention, Tournee } from '../api/types';
import { heureMetier, jourMetier, libelleJourLong } from '../commun/dates';
import { lienItineraire, lienTelephone } from '../commun/liens';
import { messageErreur } from '../commun/messageErreur';
import { statutAtteintMalgreLEchec } from '../commun/statutApresEchec';
import { useChargement } from '../commun/useChargement';
import { BadgesIntervention } from '../planning/BadgesIntervention';
import { creneau, nombreDInterventions } from '../planning/presentation';
import { FenetreCloture, type IssueCloture } from '../signature/FenetreCloture';
import { FenetreCompteRendu } from './FenetreCompteRendu';

/** L'étape en cours est mise en avant ; celles qui sont finies passent au second plan. */
const CLASSES_ETAPE: Record<StatutIntervention, string> = {
  A_PLANIFIER: 'bg-white',
  PLANIFIEE: 'bg-white',
  EN_COURS: 'border-l-[3px] border-l-sarcelle bg-white',
  TERMINEE: 'bg-gray-50 text-gris-texte',
  ANNULEE: 'bg-gray-50 text-gris-texte',
};

const BOUTON_PRINCIPAL =
  'flex h-11 w-full items-center justify-center rounded bg-sarcelle px-4 font-semibold text-white hover:bg-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50';
const BOUTON_SECONDAIRE =
  'flex h-11 w-full items-center justify-center rounded border border-gray-300 bg-white px-4 font-semibold text-sarcelle-profonde hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';

type FenetreOuverte = { type: 'cloture' | 'compte rendu'; intervention: Intervention };

/**
 * US24 : la tournée du jour du technicien connecté, pensée pour le téléphone. US17, US18 et
 * US33 : chaque étape propose l'action de son statut ; la tournée est relue après chacune.
 * Pendant la relecture, la tournée affichée reste celle d'avant : la page ne se vide pas, le
 * défilement est gardé, puis le focus va sur l'étape modifiée et le résultat est annoncé.
 */
export function PageMaTournee() {
  const prefixeEtape = useId();
  const [fenetre, setFenetre] = useState<FenetreOuverte | null>(null);
  const [annonce, setAnnonce] = useState('');
  const etapeAFocaliser = useRef<number | null>(null);
  const charger = useCallback(
    (signal: AbortSignal) => tourneesApi.consulterMaTourneeDuJour(signal),
    [],
  );
  const { etat, recharger, dernieresDonnees } = useChargement<Tournee | null>(charger);
  const tournee =
    etat.statut === 'pret'
      ? etat.donnees
      : etat.statut === 'chargement'
        ? dernieresDonnees
        : undefined;
  const jour = tournee ? tournee.dateTournee : jourMetier(new Date());
  const idEtape = (idIntervention: number) => `${prefixeEtape}-etape-${idIntervention}`;

  useEffect(() => {
    if (etat.statut !== 'pret' || etapeAFocaliser.current === null) return;
    document.getElementById(idEtape(etapeAFocaliser.current))?.focus();
    etapeAFocaliser.current = null;
  });

  function apresAction(idIntervention: number, message: string) {
    etapeAFocaliser.current = idIntervention;
    setAnnonce(message);
    recharger();
  }

  function fermerCloture(issue: IssueCloture) {
    const { id } = (fenetre as FenetreOuverte).intervention;
    setFenetre(null);
    if (issue === 'terminee') apresAction(id, 'Intervention terminée.');
    if (issue === 'incertaine') apresAction(id, 'Tournée mise à jour.');
  }

  function fermerCompteRendu(enregistre: boolean) {
    const { id } = (fenetre as FenetreOuverte).intervention;
    setFenetre(null);
    if (enregistre) apresAction(id, 'Compte rendu enregistré.');
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-fond px-4 pt-4 pb-8">
      <header className="mb-4">
        <h1 className="text-[1.75rem] leading-9 font-bold tracking-tight">Ma tournée du jour</h1>
        <p className="text-sm text-gris-texte first-letter:uppercase">{libelleJourLong(jour)}</p>
      </header>
      <p role="status" className="sr-only">
        {annonce}
      </p>

      {etat.statut === 'chargement' && tournee === undefined && (
        <p className="text-sm text-gris-texte">Chargement de votre tournée…</p>
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
      {tournee === null && (
        <p className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte">
          Vous n'avez pas de tournée aujourd'hui.
        </p>
      )}
      {tournee && (
        <>
          <p className="mb-3 text-sm font-medium">
            {tournee.interventions.length === 0
              ? 'Aucune intervention prévue pour le moment.'
              : `${nombreDInterventions(tournee.interventions.length)}, dans l'ordre de passage`}
          </p>
          <ol className="space-y-3" aria-busy={etat.statut === 'chargement'}>
            {tournee.interventions.map((intervention, rang) => (
              <EtapeTournee
                key={intervention.id}
                id={idEtape(intervention.id)}
                intervention={intervention}
                numero={rang + 1}
                onDemarree={() => apresAction(intervention.id, 'Intervention démarrée.')}
                onOuvrir={(type) => setFenetre({ type, intervention })}
              />
            ))}
          </ol>
        </>
      )}

      {fenetre?.type === 'cloture' && (
        <FenetreCloture intervention={fenetre.intervention} onFermer={fermerCloture} />
      )}
      {fenetre?.type === 'compte rendu' && (
        <FenetreCompteRendu intervention={fenetre.intervention} onFermer={fermerCompteRendu} />
      )}
    </main>
  );
}
interface PropsEtape {
  id: string;
  intervention: Intervention;
  numero: number;
  onDemarree: () => void;
  onOuvrir: (fenetre: FenetreOuverte['type']) => void;
}

function EtapeTournee({ id, intervention, numero, onDemarree, onOuvrir }: PropsEtape) {
  const { adresse, client } = intervention;
  return (
    <li
      id={id}
      // Reçoit le focus après une action, pour que la lecture reprenne sur l'étape modifiée.
      tabIndex={-1}
      className={`rounded-lg border border-bordure focus:outline-2 focus:outline-offset-2 focus:outline-sarcelle ${CLASSES_ETAPE[intervention.statut]}`}
    >
      <div className="flex items-start gap-3 border-b border-bordure px-4 py-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sarcelle text-sm font-bold text-white"
        >
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-titre text-lg font-semibold tabular-nums">
            <span className="sr-only">Étape {numero} : </span>
            {creneau(intervention)}
          </p>
          <p className="font-semibold">{intervention.type.libelle}</p>
          <p className="text-sm text-gris-texte">{intervention.dureeEstimeeMin} min</p>
          <div className="mt-1">
            <BadgesIntervention intervention={intervention} />
          </div>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm">
        <p className="font-semibold">{client.nomAffiche}</p>
        <a
          href={lienItineraire(adresse)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start justify-between gap-3 rounded border border-bordure px-3 py-2 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle"
        >
          <address className="not-italic">
            {adresse.rue}
            {adresse.complement && <span className="block">{adresse.complement}</span>}
            <span className="block">
              {adresse.codePostal} {adresse.ville}
            </span>
          </address>
          <span className="shrink-0 font-semibold text-sarcelle-profonde underline">
            Itinéraire
            <span className="sr-only"> (nouvel onglet)</span>
          </span>
        </a>
        {adresse.infosAcces && (
          <p className="rounded bg-fond px-3 py-2 text-gris-texte">
            <span className="font-semibold text-anthracite">Accès : </span>
            {adresse.infosAcces}
          </p>
        )}
        <p className="text-gris-texte">{intervention.description}</p>
        <a
          href={lienTelephone(client.telephone)}
          className="flex h-11 items-center justify-center rounded border border-gray-300 font-semibold text-sarcelle-profonde hover:bg-gray-100"
        >
          Appeler le client · {client.telephone}
        </a>
        <ActionsEtape intervention={intervention} onDemarree={onDemarree} onOuvrir={onOuvrir} />
      </div>
    </li>
  );
}

/** L'action que permet le statut de l'étape (cycle de vie, cahier des charges 5.1). */
function ActionsEtape({ intervention, onDemarree, onOuvrir }: Omit<PropsEtape, 'id' | 'numero'>) {
  switch (intervention.statut) {
    case 'PLANIFIEE':
      return <BoutonDemarrer intervention={intervention} onDemarree={onDemarree} />;
    case 'EN_COURS':
      return (
        <button type="button" onClick={() => onOuvrir('cloture')} className={BOUTON_PRINCIPAL}>
          Terminer l'intervention
        </button>
      );
    case 'TERMINEE':
      return <EtapeTerminee intervention={intervention} onOuvrir={onOuvrir} />;
    default:
      return null;
  }
}

/** US17 et RG24 : le refus de l'API (tournée qui n'est pas celle du jour) s'affiche à côté. */
function BoutonDemarrer({
  intervention,
  onDemarree,
}: Pick<PropsEtape, 'intervention' | 'onDemarree'>) {
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function demarrer() {
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      await interventionsApi.demarrer(intervention.id);
      onDemarree();
    } catch (cause) {
      if (await statutAtteintMalgreLEchec(intervention.id, 'EN_COURS')) {
        onDemarree();
        return;
      }
      setErreur(messageErreur(cause, 'Démarrage impossible'));
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={demarrer} disabled={envoiEnCours} className={BOUTON_PRINCIPAL}>
        {envoiEnCours ? 'Démarrage en cours…' : 'Démarrer'}
      </button>
      {erreur && (
        <p
          role="alert"
          className="rounded border border-erreur/30 bg-red-50 px-3 py-2 whitespace-pre-line text-red-700"
        >
          {erreur}
        </p>
      )}
    </div>
  );
}

/** US18 et RG33 : compte rendu modifiable tant que le client n'a pas signé, définitif ensuite. */
function EtapeTerminee({ intervention, onOuvrir }: Pick<PropsEtape, 'intervention' | 'onOuvrir'>) {
  const { signature, compteRendu } = intervention;
  return (
    <div className="space-y-2">
      <div className="rounded border border-bordure bg-white px-3 py-2">
        <p className="font-semibold text-anthracite">Compte rendu</p>
        <p className="whitespace-pre-line">{compteRendu ?? 'Aucun compte rendu.'}</p>
      </div>
      {signature ? (
        <p className="flex items-center gap-2 font-semibold text-anthracite">
          <span aria-hidden="true" className="text-succes">
            ✓
          </span>
          Signée par {signature.nomSignataire} à {heureMetier(signature.signeeLe)}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => onOuvrir('compte rendu')}
          className={BOUTON_SECONDAIRE}
        >
          Compléter le compte rendu
        </button>
      )}
    </div>
  );
}
