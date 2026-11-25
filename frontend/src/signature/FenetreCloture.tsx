import { useId, useRef, useState } from 'react';
import { interventionsApi } from '../api/interventions.api';
import type { FinDIntervention, Intervention } from '../api/types';
import { heureMetier } from '../commun/dates';
import { Fenetre } from '../commun/Fenetre';
import { messageErreur } from '../commun/messageErreur';
import {
  estTropLourde,
  LONGUEUR_COMPTE_RENDU,
  LONGUEUR_NOM_SIGNATAIRE,
  MESSAGE_IMAGE_TROP_LOURDE,
  raisonsDeBlocage,
} from './regles';
import { type PoigneeZoneSignature, ZoneSignature } from './ZoneSignature';

const BOUTON =
  'h-11 w-full rounded px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50';
const CHAMP =
  'mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-base focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none disabled:bg-gray-50';

const nombre = new Intl.NumberFormat('fr-FR');

type Envoi = 'avec signature' | 'sans signature';

interface Props {
  intervention: Intervention;
  /** `terminee` : l'intervention a été clôturée, la tournée doit être relue. */
  onFermer: (terminee: boolean) => void;
}

/**
 * US17, US18 et US33 : le technicien termine l'intervention en cours, en faisant signer le
 * client ou non (client absent, refus). La clôture et la signature partent dans une seule
 * requête : le serveur les enregistre ensemble ou pas du tout (RG30).
 *
 * Une signature ne doit pas se perdre par erreur : un clic sur le voile ne ferme pas, et Échap
 * ne ferme plus dès qu'un tracé, un compte rendu ou un autre nom ont été saisis.
 */
export function FenetreCloture({ intervention, onFermer }: Props) {
  const idTitre = useId();
  const idCompteRendu = useId();
  const idCompteur = useId();
  const idNom = useId();
  const idRaisons = useId();
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const zone = useRef<PoigneeZoneSignature>(null);
  const nomPropose = intervention.client.nomAffiche.slice(0, LONGUEUR_NOM_SIGNATAIRE);

  const [compteRendu, setCompteRendu] = useState('');
  const [nomSignataire, setNomSignataire] = useState(nomPropose);
  const [zoneDessinee, setZoneDessinee] = useState(false);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const raisons = raisonsDeBlocage({ compteRendu, nomSignataire, zoneVide: !zoneDessinee });
  const saisieEnCours = zoneDessinee || compteRendu.trim() !== '' || nomSignataire !== nomPropose;
  const { client, adresse } = intervention;

  async function terminer(type: Envoi, fin: FinDIntervention) {
    setErreur(null);
    setEnvoi(type);
    try {
      await interventionsApi.terminer(intervention.id, fin);
      onFermer(true);
    } catch (cause) {
      setErreur(messageErreur(cause, 'Clôture impossible'));
      setEnvoi(null);
    }
  }

  function faireSigner() {
    const image = zone.current?.exporterPng() ?? '';
    if (estTropLourde(image)) {
      setErreur(MESSAGE_IMAGE_TROP_LOURDE);
      return;
    }
    void terminer('avec signature', {
      compteRendu: compteRendu.trim(),
      signature: { image, nomSignataire: nomSignataire.trim() },
    });
  }

  function terminerSansSignature() {
    const texte = compteRendu.trim();
    void terminer('sans signature', texte === '' ? {} : { compteRendu: texte });
  }

  return (
    <Fenetre
      idTitre={idTitre}
      onFermer={() => onFermer(false)}
      focusInitial={boutonFermer}
      fermableParEchap={envoi === null && !saisieEnCours}
      className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto"
    >
      <header className="flex items-start gap-3 border-b border-bordure px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id={idTitre} className="text-lg font-semibold">
            Terminer l'intervention
          </h2>
          <p className="text-sm text-gris-texte">{intervention.type.libelle}</p>
        </div>
        <button
          ref={boutonFermer}
          type="button"
          onClick={() => onFermer(false)}
          disabled={envoi !== null}
          className="h-11 rounded border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Fermer
        </button>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded bg-fond px-3 py-2 text-sm">
          <dt className="text-gris-texte">Client</dt>
          <dd className="font-semibold">{client.nomAffiche}</dd>
          <dt className="text-gris-texte">Adresse</dt>
          <dd>
            {adresse.rue}, {adresse.codePostal} {adresse.ville}
          </dd>
          <dt className="text-gris-texte">Type</dt>
          <dd>{intervention.type.libelle}</dd>
          {intervention.demarreeLe && (
            <>
              <dt className="text-gris-texte">Démarrée</dt>
              <dd className="tabular-nums">à {heureMetier(intervention.demarreeLe)}</dd>
            </>
          )}
        </dl>

        <div>
          <label htmlFor={idCompteRendu} className="block text-sm font-medium">
            Compte rendu
          </label>
          <textarea
            id={idCompteRendu}
            value={compteRendu}
            maxLength={LONGUEUR_COMPTE_RENDU}
            rows={4}
            disabled={envoi !== null}
            onChange={(evenement) => setCompteRendu(evenement.target.value)}
            aria-describedby={idCompteur}
            className={CHAMP}
          />
          <p id={idCompteur} className="mt-1 text-xs text-gris-texte tabular-nums">
            {nombre.format(compteRendu.length)} / {nombre.format(LONGUEUR_COMPTE_RENDU)} caractères.
            Obligatoire pour faire signer.
          </p>
        </div>

        <div>
          <label htmlFor={idNom} className="block text-sm font-medium">
            Nom du signataire
          </label>
          <input
            id={idNom}
            type="text"
            value={nomSignataire}
            maxLength={LONGUEUR_NOM_SIGNATAIRE}
            autoComplete="off"
            disabled={envoi !== null}
            onChange={(evenement) => setNomSignataire(evenement.target.value)}
            className={CHAMP}
          />
        </div>

        <p className="rounded border border-sarcelle/20 bg-sarcelle-claire px-3 py-2 text-sm text-sarcelle-profonde">
          En signant, je confirme que l'intervention décrite ci-dessus a été réalisée.
        </p>

        <ZoneSignature ref={zone} onChangement={setZoneDessinee} desactivee={envoi !== null} />

        {erreur && (
          <p
            role="alert"
            className="rounded border border-erreur/30 bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-erreur"
          >
            {erreur}
          </p>
        )}

        <div className="space-y-3 pt-1">
          <div>
            <button
              type="button"
              onClick={faireSigner}
              disabled={raisons.length > 0 || envoi !== null}
              aria-describedby={raisons.length > 0 ? idRaisons : undefined}
              className={`${BOUTON} bg-sarcelle text-white hover:bg-sarcelle-profonde`}
            >
              {envoi === 'avec signature' ? 'Signature en cours…' : 'Faire signer et terminer'}
            </button>
            {raisons.length > 0 && (
              <ul id={idRaisons} className="mt-1 text-xs text-gris-texte">
                {raisons.map((raison) => (
                  <li key={raison}>{raison}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={terminerSansSignature}
            disabled={envoi !== null}
            className={`${BOUTON} border border-gray-300 bg-white hover:bg-gray-100`}
          >
            {envoi === 'sans signature' ? 'Clôture en cours…' : 'Terminer sans signature'}
          </button>
        </div>
      </div>
    </Fenetre>
  );
}
