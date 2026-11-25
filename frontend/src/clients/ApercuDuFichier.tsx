import type { LigneAnalysee, ReponseAnalyse } from '../api/types';
import { CELLULE_TABLEAU, ENTETE_TABLEAU } from '../commun/classes';
import { type LigneDetaillee, TableauDesLignes } from './ElementsImport';

/**
 * Premières lignes du fichier telles que l'API les a lues (US31). Les cellules sont du texte venu
 * d'un fichier quelconque : React les échappe, rien n'est interprété comme du HTML.
 */
export function ApercuDuFichier({ analyse }: { analyse: ReponseAnalyse }) {
  const nombre = analyse.apercu.length;
  const legende =
    nombre === 1
      ? 'Aperçu de la première ligne du fichier, telle que lue'
      : `Aperçu des ${nombre} premières lignes du fichier, telles que lues`;
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold">Aperçu du fichier</h3>
      {/* Défilable au clavier : le tableau peut être plus large que la fenêtre (RGAA 12.8). */}
      <div
        role="region"
        aria-label="Aperçu du fichier"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-bordure bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle"
      >
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{legende}</caption>
          <thead>
            <tr className="border-b border-bordure bg-fond">
              <th scope="col" className={ENTETE_TABLEAU}>
                Ligne
              </th>
              {analyse.enTetes.map((enTete, rang) => (
                <th key={rang} scope="col" className={`${ENTETE_TABLEAU} whitespace-nowrap`}>
                  {enTete.trim() === '' ? 'Sans en-tête' : enTete}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analyse.apercu.map((ligne) => (
              <tr key={ligne.numero} className="border-b border-bordure last:border-b-0">
                <th scope="row" className={`${CELLULE_TABLEAU} font-semibold tabular-nums`}>
                  {ligne.numero}
                </th>
                {ligne.cellules.map((cellule, rang) => (
                  <td key={rang} className={`${CELLULE_TABLEAU} whitespace-pre-line`}>
                    {cellule}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Lignes en erreur (rejetées à l'import, RG27) et doublons (RG28), avec leur numéro de ligne. */
export function LignesSignalees({ lignes }: { lignes: LigneAnalysee[] }) {
  const enErreur: LigneDetaillee[] = [];
  const doublons: LigneDetaillee[] = [];
  for (const ligne of lignes) {
    if (ligne.resultat === 'INVALIDE')
      enErreur.push({ numero: ligne.numero, messages: ligne.erreurs });
    if (ligne.resultat === 'DOUBLON')
      doublons.push({ numero: ligne.numero, messages: [ligne.motif] });
  }
  return (
    <>
      <section className="space-y-2">
        <h3 className="text-base font-semibold">Lignes en erreur</h3>
        {enErreur.length === 0 ? (
          <p className="text-sm text-gris-texte">Aucune ligne en erreur.</p>
        ) : (
          <>
            <p className="text-sm text-gris-texte">
              Elles ne seront pas importées ; les autres lignes le seront.
            </p>
            <TableauDesLignes
              legende="Lignes en erreur : numéro de la ligne dans le fichier et motifs du rejet"
              enteteDetail="Motifs"
              lignes={enErreur}
            />
          </>
        )}
      </section>
      {doublons.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-base font-semibold">Doublons</h3>
          <p className="text-sm text-gris-texte">
            Même téléphone ou même e-mail qu’un client existant ou qu’une ligne précédente : aucun
            client n’est créé en double.
          </p>
          <TableauDesLignes
            legende="Doublons : numéro de la ligne dans le fichier et client reconnu"
            enteteDetail="Motif"
            lignes={doublons}
          />
        </section>
      )}
    </>
  );
}
