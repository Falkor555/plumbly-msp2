import { useId } from 'react';
import type { CompteUtilisateur } from '../api/utilisateurs.api';
import { ChampSaisie } from '../commun/ChampSaisie';
import { CHAMP_DE_SAISIE } from '../commun/classes';
import { libelleDuCompte } from './presentation';
import { LONGUEUR_IDENTIFIANT_SAISI } from './validationTechnicien';

/**
 * D'où vient le compte à rattacher à la fiche : la liste des comptes sans fiche, lue par
 * l'administrateur, ou l'identifiant tapé, avec l'aide propre au rôle et, pour l'administrateur
 * dont la liste n'a pas pu être lue, la raison de ce repli.
 */
export type SourceDuCompte =
  | { sorte: 'chargement' }
  | { sorte: 'liste'; comptes: CompteUtilisateur[] }
  | { sorte: 'identifiant'; aide: string; echec?: string };

const ALERTE =
  'rounded border border-erreur/30 bg-erreur-fond px-3 py-2 text-sm whitespace-pre-line text-erreur-texte';

const REPLI_SANS_LISTE =
  'La liste des comptes n’a pas pu être lue : saisissez l’identifiant du compte.';

interface Props {
  source: Exclude<SourceDuCompte, { sorte: 'chargement' }>;
  valeur: string;
  onChanger: (valeur: string) => void;
  erreur?: string;
  desactive: boolean;
}

/** Premier champ de la création (US11) : le compte de rôle TECHNICIEN qui reçoit la fiche. */
export function ChampDuCompte({ source, valeur, onChanger, erreur, desactive }: Props) {
  if (source.sorte === 'liste') {
    return (
      <ListeDesComptes
        comptes={source.comptes}
        valeur={valeur}
        onChanger={onChanger}
        erreur={erreur}
        desactive={desactive}
      />
    );
  }
  return (
    <>
      {source.echec && (
        <p role="alert" className={ALERTE}>
          {`${REPLI_SANS_LISTE}\n${source.echec}`}
        </p>
      )}
      <ChampSaisie
        libelle="Identifiant du compte"
        obligatoire
        inputMode="numeric"
        aide={source.aide}
        longueurMax={LONGUEUR_IDENTIFIANT_SAISI}
        valeur={valeur}
        onChanger={onChanger}
        erreur={erreur}
        desactive={desactive}
      />
    </>
  );
}

type PropsListe = Omit<Props, 'source'> & { comptes: CompteUtilisateur[] };

/** Présentée comme ChampSaisie : « obligatoire » dans le nom, l'aide puis l'erreur reliées. */
function ListeDesComptes({ comptes, valeur, onChanger, erreur, desactive }: PropsListe) {
  const id = useId();
  const idAide = `${id}-aide`;
  const idErreur = `${id}-erreur`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium">
        Compte du technicien <span className="font-normal text-gris-texte">(obligatoire)</span>
      </label>
      <select
        id={id}
        value={valeur}
        required
        disabled={desactive}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${idAide} ${idErreur}` : idAide}
        onChange={(evenement) => onChanger(evenement.target.value)}
        className={CHAMP_DE_SAISIE}
      >
        <option value="">Choisissez un compte</option>
        {comptes.map((compte) => (
          <option key={compte.id} value={String(compte.id)}>
            {libelleDuCompte(compte)}
          </option>
        ))}
      </select>
      <p id={idAide} className="mt-1 text-xs text-gris-texte">
        Comptes actifs de rôle technicien qui n’ont pas encore de fiche.
      </p>
      {erreur && (
        <p id={idErreur} className="mt-1 text-xs font-medium text-erreur-texte">
          {erreur}
        </p>
      )}
    </div>
  );
}
