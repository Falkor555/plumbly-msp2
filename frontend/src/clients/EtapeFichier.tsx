import { useId } from 'react';
import { BOUTON_PRINCIPAL } from '../commun/classes';
import { AlerteImport } from './ElementsImport';
import { type ChoixSeparateur, OPTIONS_SEPARATEUR } from './importClients';
import type { AssistantImport } from './useAssistantImport';

const CHAMP =
  'mt-1 block h-9 rounded border border-gray-300 bg-white px-2 text-sm focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none';

const CHAMP_FICHIER =
  'mt-1 block w-full text-sm file:mr-3 file:h-9 file:rounded file:border file:border-gray-300 file:bg-white file:px-3 file:text-sm file:font-semibold hover:file:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';

type Props = Pick<
  AssistantImport,
  | 'fichier'
  | 'separateur'
  | 'enCours'
  | 'erreur'
  | 'choisirFichier'
  | 'changerSeparateur'
  | 'analyser'
>;

/**
 * Étape 1 de l'import (US31) : choix du fichier, lu tout de suite par le navigateur pour refuser
 * sans envoi un fichier trop lourd ou mal encodé, puis analyse par l'API, qui n'enregistre rien.
 */
export function EtapeFichier({
  fichier,
  separateur,
  enCours,
  erreur,
  choisirFichier,
  changerSeparateur,
  analyser,
}: Props) {
  const idFichier = useId();
  const idAide = useId();
  const idErreur = useId();
  const occupe = enCours !== null;
  return (
    <form
      noValidate
      onSubmit={(evenement) => {
        evenement.preventDefault();
        if (!occupe) analyser();
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor={idFichier} className="block text-sm font-medium">
          Fichier CSV
        </label>
        <input
          id={idFichier}
          type="file"
          accept=".csv,text/csv"
          aria-describedby={erreur ? `${idAide} ${idErreur}` : idAide}
          aria-invalid={erreur ? true : undefined}
          onChange={(evenement) => {
            const choisi = evenement.target.files?.[0];
            // Vidé aussitôt : choisir de nouveau le même fichier, corrigé après un refus, doit
            // relancer sa lecture, ce que le navigateur ne signale pas pour un nom inchangé.
            // « Fichier lu » garde le nom du fichier retenu.
            evenement.target.value = '';
            if (choisi) choisirFichier(choisi);
          }}
          className={CHAMP_FICHIER}
        />
        <p id={idAide} className="mt-1 text-xs text-gris-texte">
          Fichier CSV enregistré en UTF-8, de 1 Mo et 1 000 lignes au plus, avec une ligne
          d’en-têtes.
        </p>
        {fichier && (
          <p className="mt-2 text-sm">
            Fichier lu : <span className="font-semibold">{fichier.nom}</span>
          </p>
        )}
      </div>
      {/* Inactif pendant l'analyse : sa réponse porte sur le séparateur envoyé, que le menu
          doit continuer d'afficher. */}
      <ChoixDuSeparateur valeur={separateur} onChanger={changerSeparateur} desactive={occupe} />
      {erreur && <AlerteImport id={idErreur} erreur={erreur} />}
      <div className="flex justify-end">
        <button type="submit" aria-disabled={occupe || undefined} className={BOUTON_PRINCIPAL}>
          {enCours === 'analyse' ? 'Analyse en cours…' : 'Analyser le fichier'}
        </button>
      </div>
    </form>
  );
}

interface PropsSeparateur {
  valeur: ChoixSeparateur;
  onChanger: (separateur: ChoixSeparateur) => void;
  desactive?: boolean;
}

/**
 * Séparateur des colonnes : l'API le détecte sur la ligne d'en-têtes, l'utilisateur peut
 * l'imposer quand la détection se trompe.
 */
export function ChoixDuSeparateur({ valeur, onChanger, desactive = false }: PropsSeparateur) {
  return (
    <label className="block text-sm font-medium">
      Séparateur des colonnes
      <select
        value={valeur}
        disabled={desactive}
        onChange={(evenement) =>
          onChanger(
            OPTIONS_SEPARATEUR.find((option) => option.valeur === evenement.target.value)?.valeur ??
              '',
          )
        }
        className={CHAMP}
      >
        {OPTIONS_SEPARATEUR.map(({ valeur: option, libelle }) => (
          <option key={libelle} value={option}>
            {libelle}
          </option>
        ))}
      </select>
    </label>
  );
}
