import { type ReactNode, useId } from 'react';
import { BOUTON_DESTRUCTIF_PLEIN, BOUTON_SECONDAIRE } from './classes';
import { Fenetre } from './Fenetre';
import { useSoumission } from './useSoumission';

interface Props {
  titre: string;
  /** Ce que l'action change, et ce qu'elle a de définitif. */
  message: ReactNode;
  libelleConfirmer: string;
  /** Libellé du bouton pendant l'envoi, par exemple « Archivage en cours… ». */
  libelleEnCours: string;
  /** Contexte écrit dans la console si l'erreur ne vient pas de l'API. */
  contexteErreur: string;
  /** Action confirmée ; en cas de succès, l'appelant ferme la fenêtre. */
  onConfirmer: () => Promise<void>;
  onAnnuler: () => void;
}

/**
 * Confirmation d'une action destructive. Le focus part sur « Annuler » : Entrée par réflexe ne
 * détruit rien. Le message décrit la fenêtre, pour être lu avec son titre dès l'ouverture. Un refus
 * de l'API (409, 400) s'affiche tel quel et la fenêtre reste ouverte, pour que l'utilisateur lise
 * pourquoi avant de revenir à la page ; le focus revient alors sur « Annuler ».
 */
export function FenetreConfirmation({
  titre,
  message,
  libelleConfirmer,
  libelleEnCours,
  contexteErreur,
  onConfirmer,
  onAnnuler,
}: Props) {
  const idTitre = useId();
  const idMessage = useId();
  const { repliApresEchec, envoiEnCours, erreurServeur, soumettre } = useSoumission(contexteErreur);

  return (
    <Fenetre
      idTitre={idTitre}
      idDescription={idMessage}
      onFermer={onAnnuler}
      focusInitial={repliApresEchec}
      fermableParEchap={!envoiEnCours}
    >
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <h2 id={idTitre} className="text-lg font-semibold">
          {titre}
        </h2>
        <div id={idMessage} className="space-y-2 text-sm">
          {message}
        </div>
        {erreurServeur && (
          <p
            role="alert"
            className="rounded border border-erreur/30 bg-erreur-fond px-3 py-2 text-sm whitespace-pre-line text-erreur-texte"
          >
            {erreurServeur}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={repliApresEchec}
            type="button"
            onClick={onAnnuler}
            disabled={envoiEnCours}
            className={BOUTON_SECONDAIRE}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void soumettre(true, onConfirmer)}
            disabled={envoiEnCours}
            className={BOUTON_DESTRUCTIF_PLEIN}
          >
            {envoiEnCours ? libelleEnCours : libelleConfirmer}
          </button>
        </div>
      </div>
    </Fenetre>
  );
}
