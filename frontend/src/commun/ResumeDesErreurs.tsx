const ALERTE =
  'rounded border border-erreur/30 bg-erreur-fond px-3 py-2 text-sm whitespace-pre-line text-erreur-texte';

interface Props {
  /** Champs refusés par la validation au dernier envoi. */
  nombreAuRefus: number;
  /** Champs encore en erreur : à zéro, le résumé disparaît. */
  restantes: number;
  /** Refus de l'API (400) ou échec de l'envoi, affiché tel quel. */
  erreurServeur: string | null;
}

/**
 * Annonce, à côté des boutons, pourquoi l'enregistrement n'a pas eu lieu : les champs à corriger
 * (chacun porte son message) ou le message de l'API, ligne par ligne. Le nombre est celui du
 * dernier envoi : recalculé à chaque correction, l'alerte interromprait la saisie à chaque champ.
 * L'appelant change la clé du composant à chaque refus, pour que l'alerte soit annoncée de nouveau.
 */
export function ResumeDesErreurs({ nombreAuRefus, restantes, erreurServeur }: Props) {
  if (erreurServeur) {
    return (
      <p role="alert" className={ALERTE}>
        {erreurServeur}
      </p>
    );
  }
  if (restantes === 0 || nombreAuRefus === 0) return null;
  return (
    <p role="alert" className={ALERTE}>
      {nombreAuRefus === 1
        ? 'Un champ est à corriger : son message est affiché sous lui.'
        : `${nombreAuRefus} champs sont à corriger : chaque message est affiché sous son champ.`}
    </p>
  );
}
