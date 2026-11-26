import { type FormEvent, useId, useRef, useState } from 'react';
import { interventionsApi } from '../api/interventions.api';
import type { Intervention } from '../api/types';
import { libelleJourLong } from '../commun/dates';
import { Fenetre } from '../commun/Fenetre';
import { messageErreur } from '../commun/messageErreur';
import { nomComplet } from '../planning/presentation';
import { erreursDuMotif, LONGUEUR_MOTIF_MAX } from './saisie';

const BOUTON =
  'h-11 rounded px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50';

interface Props {
  intervention: Intervention;
  onAnnulee: (intervention: Intervention) => void;
  onFermer: () => void;
}

/** US16 : annuler une intervention, avec un motif obligatoire (RG05). */
export function FenetreAnnulation({ intervention, onAnnulee, onFermer }: Props) {
  const id = useId();
  const champMotif = useRef<HTMLTextAreaElement>(null);
  const [motif, setMotif] = useState('');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const { tournee } = intervention;

  async function confirmer(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    if (envoi) return;
    const trouvees = erreursDuMotif(motif);
    setErreurs(trouvees);
    if (trouvees.length > 0) return;
    setEnvoi(true);
    try {
      onAnnulee(await interventionsApi.annuler(intervention.id, motif.trim()));
    } catch (erreur) {
      setErreurs([messageErreur(erreur, 'Annulation d’une intervention')]);
      setEnvoi(false);
    }
  }

  return (
    // Échap ne ferme pas une fois le motif commencé : la saisie ne se perd pas par erreur.
    <Fenetre
      idTitre={`${id}-titre`}
      onFermer={onFermer}
      focusInitial={champMotif}
      fermableParEchap={motif === ''}
    >
      <form onSubmit={confirmer} noValidate className="space-y-4 px-6 py-5">
        <h2 id={`${id}-titre`} className="text-lg font-semibold">
          Annuler l’intervention
        </h2>
        <p className="text-sm text-gris-texte">
          {intervention.type.libelle} chez {intervention.client.nomAffiche}.{' '}
          {tournee
            ? `Elle sera retirée de la tournée de ${nomComplet(tournee.technicien)} du ${libelleJourLong(tournee.dateTournee)}.`
            : 'Elle n’est dans aucune tournée.'}{' '}
          L’annulation est définitive.
        </p>

        <div>
          <label htmlFor={`${id}-motif`} className="text-sm font-semibold">
            Motif de l’annulation
          </label>
          <textarea
            ref={champMotif}
            id={`${id}-motif`}
            rows={3}
            maxLength={LONGUEUR_MOTIF_MAX}
            value={motif}
            onChange={(evenement) => setMotif(evenement.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-anthracite focus-visible:border-sarcelle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sarcelle"
          />
        </div>

        {erreurs.length > 0 && (
          <ul
            role="alert"
            className="rounded border border-erreur/30 bg-erreur-fond px-3 py-2 text-sm whitespace-pre-line text-erreur-texte"
          >
            {erreurs.map((erreur) => (
              <li key={erreur}>{erreur}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onFermer}
            className={`${BOUTON} border border-gray-300 bg-white text-sarcelle-profonde hover:bg-gray-100`}
          >
            Retour
          </button>
          <button
            type="submit"
            disabled={envoi}
            className={`${BOUTON} bg-erreur text-white hover:bg-erreur-texte`}
          >
            {envoi ? 'Annulation…' : 'Confirmer l’annulation'}
          </button>
        </div>
      </form>
    </Fenetre>
  );
}
