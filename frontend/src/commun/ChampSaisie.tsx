import { type Ref, useId } from 'react';
import { CHAMP_DE_SAISIE } from './classes';

interface Props {
  libelle: string;
  valeur: string;
  onChanger: (valeur: string) => void;
  /** Sans objet pour un champ date ou heure, dont le navigateur borne la valeur. */
  longueurMax?: number;
  /** Message de validation, relié au champ ; absent quand la saisie est valide. */
  erreur?: string;
  obligatoire?: boolean;
  aide?: string;
  type?: 'text' | 'tel' | 'email' | 'date' | 'time';
  /** Borne haute d'un champ date ou heure (attribut max), par exemple « 9999-12-31 ». */
  max?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  desactive?: boolean;
  ref?: Ref<HTMLInputElement>;
  /** Classes du bloc (étendue dans une grille, par exemple). */
  className?: string;
}

/**
 * Champ de formulaire étiqueté. La mention « obligatoire » fait partie du libellé, donc du nom
 * accessible ; l'aide puis l'erreur sont reliées par aria-describedby et l'erreur marque le champ
 * aria-invalid (RGAA 11.10).
 */
export function ChampSaisie({
  libelle,
  valeur,
  onChanger,
  longueurMax,
  erreur,
  obligatoire = false,
  aide,
  type = 'text',
  max,
  inputMode,
  desactive = false,
  ref,
  className,
}: Props) {
  const id = useId();
  const idAide = `${id}-aide`;
  const idErreur = `${id}-erreur`;
  const descriptions = [aide && idAide, erreur && idErreur].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium">
        {libelle}
        {/* L'espace hors de la mention, sans quoi le nom accessible colle « Nom(obligatoire) ». */}
        {obligatoire && ' '}
        {obligatoire && <span className="font-normal text-gris-texte">(obligatoire)</span>}
      </label>
      <input
        ref={ref}
        id={id}
        type={type}
        max={max}
        inputMode={inputMode}
        // Le gestionnaire saisit les coordonnées d’un tiers : les siennes ne doivent pas être proposées.
        autoComplete="off"
        value={valeur}
        maxLength={longueurMax}
        required={obligatoire}
        disabled={desactive}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={descriptions || undefined}
        onChange={(evenement) => onChanger(evenement.target.value)}
        className={CHAMP_DE_SAISIE}
      />
      {aide && (
        <p id={idAide} className="mt-1 text-xs text-gris-texte">
          {aide}
        </p>
      )}
      {erreur && (
        <p id={idErreur} className="mt-1 text-xs font-medium text-erreur-texte">
          {erreur}
        </p>
      )}
    </div>
  );
}
