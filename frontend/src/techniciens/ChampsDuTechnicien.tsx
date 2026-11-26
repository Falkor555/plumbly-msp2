import { type Ref, useId } from 'react';
import { ChampSaisie } from '../commun/ChampSaisie';
import { AIDE_TELEPHONE, LONGUEUR_TELEPHONE_SAISI } from '../commun/telephone';
import { COULEUR_PROPOSEE } from './validationTechnicien';

/* Champs partagés par la création et la modification d'une fiche technicien (US11). */

interface PropsTelephone {
  valeur: string;
  onChanger: (valeur: string) => void;
  erreur?: string;
  desactive: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function ChampTelephone({ valeur, onChanger, erreur, desactive, ref }: PropsTelephone) {
  return (
    <ChampSaisie
      ref={ref}
      libelle="Téléphone"
      obligatoire
      type="tel"
      inputMode="tel"
      aide={AIDE_TELEPHONE}
      longueurMax={LONGUEUR_TELEPHONE_SAISI}
      valeur={valeur}
      onChanger={onChanger}
      erreur={erreur}
      desactive={desactive}
    />
  );
}

interface PropsCouleur {
  libelle: string;
  /** #RRGGBB en majuscules, comme l'API l'enregistre. */
  valeur: string;
  onChanger: (couleur: string) => void;
  desactive: boolean;
}

/**
 * Nuancier de la couleur du planning. La valeur est aussi écrite en clair à côté, et lue avec le
 * champ : la couleur ne doit pas être la seule façon de transmettre l'information (RGAA 3.1).
 */
export function ChampCouleur({ libelle, valeur, onChanger, desactive }: PropsCouleur) {
  const id = useId();
  const idValeur = `${id}-valeur`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium">
        {libelle}
      </label>
      <div className="mt-1 flex items-center gap-3">
        <input
          id={id}
          type="color"
          // Le navigateur ramène la valeur en minuscules : la lui donner ainsi évite un écart
          // entre la valeur du champ et celle de l'état à chaque rendu.
          value={valeur.toLowerCase()}
          disabled={desactive}
          aria-describedby={idValeur}
          onChange={(evenement) => onChanger(evenement.target.value.toUpperCase())}
          className="h-9 w-14 cursor-pointer rounded border border-gray-300 bg-white p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span id={idValeur} className="font-mono text-sm">
          {valeur.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

interface PropsChoix {
  /** null : la couleur est laissée au choix de l'API. */
  couleur: string | null;
  onChanger: (couleur: string | null) => void;
  desactive: boolean;
}

/** À la création, la couleur est facultative : sans choix, l'API en attribue une de sa palette. */
export function ChoixDeLaCouleur({ couleur, onChanger, desactive }: PropsChoix) {
  const idAide = useId();
  const automatique = couleur === null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium">Couleur du planning</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!automatique}
          disabled={desactive}
          aria-describedby={automatique ? idAide : undefined}
          onChange={(evenement) => onChanger(evenement.target.checked ? COULEUR_PROPOSEE : null)}
          className="size-4 accent-sarcelle"
        />
        Choisir la couleur
      </label>
      {automatique ? (
        <p id={idAide} className="text-xs text-gris-texte">
          Sans choix, l’application attribue une couleur de sa palette, de préférence une couleur
          qu’aucun technicien en service n’utilise encore.
        </p>
      ) : (
        <ChampCouleur
          libelle="Couleur choisie"
          valeur={couleur}
          onChanger={onChanger}
          desactive={desactive}
        />
      )}
    </fieldset>
  );
}
