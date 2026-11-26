import { useId } from 'react';
import type { ChampClient, ReponseAnalyse, StrategieDoublons } from '../api/types';
import {
  BOUTON_PRINCIPAL,
  BOUTON_SECONDAIRE,
  CELLULE_TABLEAU,
  ENTETE_TABLEAU,
} from '../commun/classes';
import { ApercuDuFichier, LignesSignalees } from './ApercuDuFichier';
import { AlerteImport, Compteurs } from './ElementsImport';
import { ChoixDuSeparateur } from './EtapeFichier';
import {
  CHAMPS_CLIENT,
  champAffiche,
  LIBELLES_SEPARATEUR,
  lignesAEnregistrer,
  libelleDuMenu,
  nombreDeLignes,
  OPTIONS_STRATEGIE,
  optionsDeChamp,
} from './importClients';
import type { AssistantImport } from './useAssistantImport';

const SELECTION =
  'block h-9 w-full min-w-48 rounded border border-gray-300 bg-white px-2 text-sm focus:border-sarcelle focus:ring-3 focus:ring-sarcelle/15 focus:outline-none';

type Props = Pick<
  AssistantImport,
  | 'choix'
  | 'enTetesEnRelecture'
  | 'separateur'
  | 'strategie'
  | 'enCours'
  | 'erreur'
  | 'erreurImport'
  | 'changerSeparateur'
  | 'changerChamp'
  | 'changerStrategie'
  | 'importer'
  | 'recommencer'
> & { analyse: ReponseAnalyse };

/**
 * Étape 2 de l'import (US31) : ce que l'API a lu, sans rien enregistrer. Chaque changement de
 * séparateur ou de colonne relance l'analyse ; l'utilisateur choisit le sort des doublons (RG28)
 * puis lance l'import.
 */
export function EtapeAnalyse(props: Props) {
  const { analyse, enCours, erreur } = props;
  const idErreur = useId();
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <Compteurs
          compteurs={[
            { libelle: 'Lignes lues', valeur: analyse.totaux.lignes },
            { libelle: 'Valides', valeur: analyse.totaux.valides },
            { libelle: 'Doublons', valeur: analyse.totaux.doublons },
            { libelle: 'En erreur', valeur: analyse.totaux.invalides },
          ]}
        />
        <div className="flex flex-wrap items-end gap-4">
          <ChoixDuSeparateur
            valeur={props.separateur}
            onChanger={props.changerSeparateur}
            desactive={enCours === 'import'}
          />
          <p className="pb-2 text-sm text-gris-texte">
            Séparateur lu : {LIBELLES_SEPARATEUR[analyse.separateur]}.
          </p>
          {/* Toujours présent, pour que l'annonce d'une nouvelle analyse soit lue (RGAA 7.5). */}
          <p role="status" className="pb-2 text-sm text-gris-texte">
            {enCours === 'analyse' ? 'Analyse en cours…' : ''}
          </p>
        </div>
      </section>
      {erreur && <AlerteImport id={idErreur} erreur={erreur} />}
      <TableauCorrespondance
        analyse={analyse}
        choix={props.choix}
        onChangerChamp={props.changerChamp}
        desactive={enCours === 'import' || props.enTetesEnRelecture}
        colonneRefusee={
          erreur?.colonne === undefined ? undefined : { enTete: erreur.colonne, idErreur }
        }
      />
      <ColonnesIgnorees colonnes={analyse.colonnesIgnorees} />
      <ApercuDuFichier analyse={analyse} />
      <LignesSignalees lignes={analyse.lignes} />
      {analyse.totaux.doublons > 0 && (
        <ChoixDeLaStrategie
          strategie={props.strategie}
          onChanger={props.changerStrategie}
          desactive={enCours === 'import'}
        />
      )}
      <ActionsDeLImport {...props} />
    </div>
  );
}

interface PropsCorrespondance {
  analyse: ReponseAnalyse;
  choix: AssistantImport['choix'];
  onChangerChamp: AssistantImport['changerChamp'];
  desactive: boolean;
  /** Colonne dont le changement a été refusé, et l'identifiant du message du refus. */
  colonneRefusee: { enTete: string; idErreur: string } | undefined;
}

function TableauCorrespondance({
  analyse,
  choix,
  onChangerChamp,
  desactive,
  colonneRefusee,
}: PropsCorrespondance) {
  const idAide = useId();
  const champs = new Map(
    analyse.enTetes.map((enTete) => [enTete, champAffiche(choix, analyse.correspondance, enTete)]),
  );
  const exemple = analyse.apercu[0];
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold">Correspondance des colonnes</h3>
      <p id={idAide} className="text-sm text-gris-texte">
        Champs obligatoires : téléphone, rue, code postal, ville, et nom (particulier) ou raison
        sociale (professionnel). Chaque changement relance l’analyse, sans rien enregistrer.
      </p>
      <div className="overflow-x-auto rounded-lg border border-bordure bg-white">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Colonnes du fichier, exemple de valeur et champ du client qui la reçoit
          </caption>
          <thead>
            <tr className="border-b border-bordure bg-fond">
              <th scope="col" className={ENTETE_TABLEAU}>
                Colonne du fichier
              </th>
              <th scope="col" className={ENTETE_TABLEAU}>
                {exemple ? `Exemple (ligne ${exemple.numero})` : 'Exemple'}
              </th>
              <th scope="col" className={ENTETE_TABLEAU}>
                Champ du client
              </th>
            </tr>
          </thead>
          <tbody>
            {analyse.enTetes.map((enTete, rang) => (
              <tr key={rang} className="border-b border-bordure last:border-b-0">
                <th scope="row" className={`${CELLULE_TABLEAU} font-semibold`}>
                  {enTete.trim() === '' ? (
                    <span className="text-gris-texte">Sans en-tête</span>
                  ) : (
                    enTete
                  )}
                </th>
                <td className={CELLULE_TABLEAU}>{exemple?.cellules[rang] ?? ''}</td>
                <td className={CELLULE_TABLEAU}>
                  <MenuDuChamp
                    enTete={enTete}
                    rang={rang}
                    champs={champs}
                    idAide={idAide}
                    idErreur={
                      colonneRefusee?.enTete === enTete ? colonneRefusee.idErreur : undefined
                    }
                    onChanger={onChangerChamp}
                    desactive={desactive}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface PropsMenu {
  enTete: string;
  /** Rang de la colonne dans le fichier, à partir de 0. */
  rang: number;
  champs: ReadonlyMap<string, ChampClient | null>;
  idAide: string;
  /** Message du refus de l'analyse quand c'est le changement de cette colonne qui l'a causé. */
  idErreur: string | undefined;
  onChanger: (enTete: string, champ: ChampClient | null) => void;
  desactive: boolean;
}

/**
 * Le menu reste actif pendant l'analyse due à un changement de colonne : le focus n'est pas
 * perdu, la dernière l'emporte. Il est inactif pendant la relecture due au séparateur, dont les
 * en-têtes remplaceront ceux affichés.
 */
function MenuDuChamp({ enTete, rang, champs, idAide, idErreur, onChanger, desactive }: PropsMenu) {
  return (
    <select
      aria-label={libelleDuMenu(enTete, rang)}
      aria-describedby={idErreur ? `${idAide} ${idErreur}` : idAide}
      aria-invalid={idErreur ? true : undefined}
      value={champs.get(enTete) ?? ''}
      disabled={desactive}
      onChange={(evenement) =>
        onChanger(enTete, CHAMPS_CLIENT.find((champ) => champ === evenement.target.value) ?? null)
      }
      className={SELECTION}
    >
      <option value="">Ignorer la colonne</option>
      {optionsDeChamp(champs, enTete).map(({ valeur, libelle }) => (
        <option key={valeur} value={valeur}>
          {libelle}
        </option>
      ))}
    </select>
  );
}

function ColonnesIgnorees({ colonnes }: { colonnes: string[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold">Colonnes ignorées</h3>
      {colonnes.length === 0 ? (
        <p className="text-sm text-gris-texte">Aucune : chaque colonne alimente un champ.</p>
      ) : (
        <ul className="flex flex-wrap gap-2 text-sm">
          {colonnes.map((colonne, rang) => (
            <li key={rang} className="rounded border border-bordure bg-white px-2 py-0.5">
              {colonne.trim() === '' ? 'Sans en-tête' : colonne}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface PropsStrategie {
  strategie: StrategieDoublons;
  onChanger: (strategie: StrategieDoublons) => void;
  desactive: boolean;
}

/** RG28 : un doublon n'est jamais créé ; l'utilisateur choisit de l'ignorer ou de mettre à jour. */
function ChoixDeLaStrategie({ strategie, onChanger, desactive }: PropsStrategie) {
  const nom = useId();
  const idAide = useId();
  return (
    <fieldset className="space-y-2" aria-describedby={idAide}>
      <legend className="text-base font-semibold">Que faire des doublons ?</legend>
      <p id={idAide} className="text-sm text-gris-texte">
        Une mise à jour remplace seulement les valeurs renseignées dans le fichier : elle n’efface
        rien, ajoute l’adresse si elle est nouvelle et ne touche jamais un client archivé.
      </p>
      <div className="flex flex-wrap gap-4">
        {OPTIONS_STRATEGIE.map(({ valeur, libelle }) => (
          <label key={valeur} className="flex h-9 items-center gap-2 text-sm">
            <input
              type="radio"
              name={nom}
              value={valeur}
              checked={strategie === valeur}
              disabled={desactive}
              onChange={() => onChanger(valeur)}
              className="size-4 accent-sarcelle"
            />
            {libelle}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * « Importer N lignes » : le nombre suit la stratégie choisie. Le bouton reste focalisable quand
 * il est inactif (aria-disabled), pour que son explication soit lue au clavier.
 */
function ActionsDeLImport({
  analyse,
  strategie,
  enCours,
  erreur,
  erreurImport,
  importer,
  recommencer,
}: Props) {
  const idExplication = useId();
  const nombre = lignesAEnregistrer(analyse.totaux, strategie);
  const possible = enCours === null && erreur === null && nombre > 0;
  return (
    <section className="space-y-3 border-t border-bordure pt-4">
      {erreurImport && <AlerteImport erreur={{ message: erreurImport }} />}
      <p id={idExplication} className="text-sm text-gris-texte">
        {explication(nombre, erreur !== null)}
      </p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={recommencer}
          disabled={enCours === 'import'}
          className={BOUTON_SECONDAIRE}
        >
          Choisir un autre fichier
        </button>
        <button
          type="button"
          aria-disabled={!possible || undefined}
          aria-describedby={idExplication}
          onClick={() => {
            if (possible) importer();
          }}
          className={BOUTON_PRINCIPAL}
        >
          {enCours === 'import' ? 'Import en cours…' : `Importer ${nombreDeLignes(nombre)}`}
        </button>
      </div>
    </section>
  );
}

function explication(nombre: number, analyseRefusee: boolean): string {
  if (analyseRefusee) return 'Corrigez la correspondance des colonnes avant d’importer.';
  if (nombre === 0) return 'Aucune ligne à enregistrer avec ces choix.';
  return 'Rien n’est enregistré avant ce clic. Les lignes en erreur ne seront pas importées.';
}
