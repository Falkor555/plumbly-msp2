import type { Ref } from 'react';
import { BOUTON_PRINCIPAL, BOUTON_SECONDAIRE } from '../commun/classes';

interface Props {
  /** Libellé du bouton d'envoi, qui dit aussi quand l'envoi est en cours. */
  libelleEnvoi: string;
  envoiEnCours: boolean;
  onAnnuler: () => void;
  /** Posé sur le bouton d'envoi, qui reprend le focus après un refus de l'API. */
  refEnvoi: Ref<HTMLButtonElement>;
}

/** « Annuler » et l'envoi d'un formulaire de fenêtre, tous deux inactifs pendant l'envoi. */
export function BoutonsDuFormulaire({ libelleEnvoi, envoiEnCours, onAnnuler, refEnvoi }: Props) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onAnnuler}
        disabled={envoiEnCours}
        className={BOUTON_SECONDAIRE}
      >
        Annuler
      </button>
      <button ref={refEnvoi} type="submit" disabled={envoiEnCours} className={BOUTON_PRINCIPAL}>
        {libelleEnvoi}
      </button>
    </div>
  );
}
