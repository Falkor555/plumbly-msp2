import { type FormEvent, useId, useRef, useState } from 'react';
import { interventionsApi } from '../api/interventions.api';
import type { Intervention } from '../api/types';
import { Fenetre } from '../commun/Fenetre';
import { messageErreur } from '../commun/messageErreur';
import { LONGUEUR_COMPTE_RENDU } from '../signature/regles';

const nombre = new Intl.NumberFormat('fr-FR');

interface Props {
  intervention: Intervention;
  /** `enregistre` : le compte rendu a changé, la tournée doit être relue. */
  onFermer: (enregistre: boolean) => void;
}

/**
 * US18 : complète le compte rendu d'une intervention terminée et non signée. Le texte envoyé
 * remplace le précédent : il est donc prérempli. Une fois signée, l'intervention n'a plus ce
 * bouton (RG33).
 */
export function FenetreCompteRendu({ intervention, onFermer }: Props) {
  const idTitre = useId();
  const idTexte = useId();
  const idCompteur = useId();
  const champ = useRef<HTMLTextAreaElement>(null);
  const [compteRendu, setCompteRendu] = useState(intervention.compteRendu ?? '');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const texte = compteRendu.trim();

  async function enregistrer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      await interventionsApi.completerCompteRendu(intervention.id, texte);
      onFermer(true);
    } catch (cause) {
      setErreur(messageErreur(cause, 'Compte rendu non enregistré'));
      setEnvoiEnCours(false);
    }
  }

  return (
    <Fenetre
      idTitre={idTitre}
      onFermer={() => onFermer(false)}
      focusInitial={champ}
      fermableParEchap={!envoiEnCours}
    >
      <header className="border-b border-bordure px-4 py-4 sm:px-6">
        <h2 id={idTitre} className="text-lg font-semibold">
          Compléter le compte rendu
        </h2>
        <p className="text-sm text-gris-texte">
          {intervention.type.libelle} · {intervention.client.nomAffiche}
        </p>
      </header>
      <form onSubmit={enregistrer} className="space-y-4 px-4 py-4 sm:px-6">
        <div>
          <label htmlFor={idTexte} className="block text-sm font-medium">
            Compte rendu
          </label>
          <textarea
            ref={champ}
            id={idTexte}
            value={compteRendu}
            maxLength={LONGUEUR_COMPTE_RENDU}
            rows={6}
            required
            disabled={envoiEnCours}
            onChange={(evenement) => setCompteRendu(evenement.target.value)}
            aria-describedby={idCompteur}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-base focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none disabled:bg-gray-50"
          />
          <p id={idCompteur} className="mt-1 text-xs text-gris-texte tabular-nums">
            {nombre.format(compteRendu.length)} / {nombre.format(LONGUEUR_COMPTE_RENDU)} caractères.
            Le nouveau texte remplace le précédent.
          </p>
        </div>

        {erreur && (
          <p
            role="alert"
            className="rounded border border-erreur/30 bg-erreur-fond px-3 py-2 text-sm whitespace-pre-line text-erreur-texte"
          >
            {erreur}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onFermer(false)}
            disabled={envoiEnCours}
            className="h-11 rounded border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={texte === '' || envoiEnCours}
            className="h-11 rounded bg-sarcelle px-4 text-sm font-semibold text-white hover:bg-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50"
          >
            {envoiEnCours ? 'Enregistrement en cours…' : 'Enregistrer le compte rendu'}
          </button>
        </div>
      </form>
    </Fenetre>
  );
}
