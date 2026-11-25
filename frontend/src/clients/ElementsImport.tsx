import { CELLULE_TABLEAU, ENTETE_TABLEAU } from '../commun/classes';
import type { ErreurAffichee } from './importClients';

/*
 * Briques communes aux étapes de l'import (US31) : alerte, compteurs et tableau des lignes. Tout
 * contenu venu du fichier ou de l'API est rendu en texte par React, jamais en HTML.
 */

const ALERTE =
  'space-y-1 rounded border border-erreur/30 bg-erreur-fond px-3 py-2 text-sm text-erreur-texte';

interface PropsAlerte {
  erreur: ErreurAffichee;
  id?: string;
}

/** Refus du fichier, de l'analyse ou de l'import : le message tel quel, puis ce qu'il faut faire. */
export function AlerteImport({ erreur, id }: PropsAlerte) {
  return (
    <div id={id} role="alert" className={ALERTE}>
      <p className="whitespace-pre-line">{erreur.message}</p>
      {erreur.aide && <p className="font-semibold">{erreur.aide}</p>}
    </div>
  );
}

interface PropsCompteurs {
  compteurs: { libelle: string; valeur: number }[];
}

/** Compteurs de l'analyse ou du compte rendu, côte à côte. */
export function Compteurs({ compteurs }: PropsCompteurs) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {compteurs.map(({ libelle, valeur }) => (
        <div key={libelle} className="rounded border border-bordure bg-white px-3 py-2">
          <dt className="text-xs text-gris-texte">{libelle}</dt>
          <dd className="text-lg font-semibold tabular-nums">{valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface LigneDetaillee {
  numero: number;
  messages: string[];
}

interface PropsTableau {
  legende: string;
  enteteDetail: string;
  lignes: LigneDetaillee[];
}

/** Lignes du fichier avec leur numéro (l'en-tête est la ligne 1) et leurs motifs. */
export function TableauDesLignes({ legende, enteteDetail, lignes }: PropsTableau) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bordure bg-white">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{legende}</caption>
        <thead>
          <tr className="border-b border-bordure bg-fond">
            <th scope="col" className={`${ENTETE_TABLEAU} w-20`}>
              Ligne
            </th>
            <th scope="col" className={ENTETE_TABLEAU}>
              {enteteDetail}
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={ligne.numero} className="border-b border-bordure last:border-b-0">
              <th scope="row" className={`${CELLULE_TABLEAU} font-semibold tabular-nums`}>
                {ligne.numero}
              </th>
              <td className={CELLULE_TABLEAU}>
                <Messages messages={ligne.messages} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Messages({ messages }: { messages: string[] }) {
  if (messages.length === 1) return <>{messages[0]}</>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {messages.map((message, rang) => (
        // Deux motifs identiques sont possibles : le rang les distingue.
        <li key={`${rang}-${message}`}>{message}</li>
      ))}
    </ul>
  );
}
