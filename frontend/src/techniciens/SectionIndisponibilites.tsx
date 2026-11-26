import { type Ref, type RefObject, useCallback, useEffect, useId, useRef, useState } from 'react';
import { techniciensApi } from '../api/techniciens.api';
import type { FicheTechnicien, Indisponibilite } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { AnnonceDuTotal } from '../commun/AnnonceDuTotal';
import {
  BOUTON_SECONDAIRE,
  CELLULE_TABLEAU,
  CHAMP_DE_FILTRE,
  ENTETE_TABLEAU,
} from '../commun/classes';
import { dateHeureMetier } from '../commun/dates';
import { type ActionsDeLaFiche, BoutonDeLaFiche, Section } from '../commun/ElementsDeLaFiche';
import { useChargement } from '../commun/useChargement';
import { useFocusApresRelecture } from '../commun/useFocusApresRelecture';
import { useReessai } from '../commun/useReessai';
import { useValeurDifferee } from '../commun/useValeurDifferee';
import { nomComplet } from '../planning/presentation';
import type { ActionFicheTechnicien } from './FenetreDeLaFicheTechnicien';
import {
  DERNIER_JOUR_SAISISSABLE,
  estTerminee,
  memesBornes,
  SAISIE_PERIODE_VIDE,
  type SaisiePeriode,
  verifierPeriode,
  versPeriode,
} from './indisponibilites';

/** Ce que la fiche demande à la section après un ajout ou une suppression. */
export interface RelectureDesIndisponibilites {
  /** Incrémentée à chaque écriture : la liste est relue. */
  version: number;
  /** Après une suppression, le bouton qui avait le focus disparaît : le titre de la section le reprend. */
  focaliserLeTitre: boolean;
}

interface Props {
  technicien: FicheTechnicien;
  /** Absentes pour un technicien archivé : sa fiche est en lecture seule, indisponibilités comprises. */
  actions?: ActionsDeLaFiche<ActionFicheTechnicien>;
  relecture: RelectureDesIndisponibilites;
  /** Horloge, injectable par les tests : une indisponibilité terminée ne se supprime plus. */
  maintenant: () => Date;
}

/**
 * US12 : indisponibilités du technicien. Sans période choisie, l'API renvoie celles en cours et à
 * venir ; une période (bornes facultatives, jours de La Réunion) montre aussi l'historique.
 */
export function SectionIndisponibilites({ technicien, actions, relecture, maintenant }: Props) {
  const periode = usePeriodeDeLaListe();
  const titre = useRef<HTMLHeadingElement>(null);
  const charger = useCallback(
    (signal: AbortSignal) =>
      techniciensApi.listerIndisponibilites(technicien.id, versPeriode(periode.bornes), signal),
    [technicien.id, periode.bornes],
  );
  const { etat, recharger, dernieresDonnees } = useChargement<Indisponibilite[]>(charger);
  const liste = etat.statut === 'pret' ? etat.donnees : dernieresDonnees;
  const { zoneDeRepli, reessayer } = useReessai<HTMLDivElement>(recharger);
  const focaliserApresRelecture = useFocusApresRelecture(liste);
  // Pendant la relecture de la liste (ajout, suppression, autre période), les lignes affichées sont
  // périmées : une suppression partirait sur un identifiant déjà disparu (404).
  const actionsDeLaListe = actions && {
    ...actions,
    inactives: actions.inactives || etat.statut === 'chargement',
  };

  useEffect(() => {
    // La version 0 est celle de l'arrivée sur la fiche : la première lecture est déjà partie.
    if (relecture.version === 0) return;
    if (relecture.focaliserLeTitre) focaliserApresRelecture(titre);
    recharger();
  }, [relecture, focaliserApresRelecture, recharger]);

  const filtree = periode.bornes.du !== '' || periode.bornes.au !== '';
  return (
    <Section
      titre="Indisponibilités"
      refTitre={titre}
      action={
        actionsDeLaListe && (
          <BoutonDeLaFiche actions={actionsDeLaListe} action={{ nom: 'ajout-indisponibilite' }}>
            Ajouter une indisponibilité
          </BoutonDeLaFiche>
        )
      }
    >
      <div className="space-y-3 px-4 py-4">
        <FiltrePeriode periode={periode} filtree={filtree} />
        <AnnonceDuTotal
          etiquette="Nombre d’indisponibilités"
          texte={etat.statut === 'pret' ? resultatDeLaListe(etat.donnees, filtree) : null}
        />
        {/* Repli du focus après « Réessayer » ; ce bloc n'est pas dans l'ordre de tabulation. */}
        <div ref={zoneDeRepli} tabIndex={-1} className="space-y-3 focus:outline-none">
          {etat.statut === 'erreur' ? (
            <AlerteChargement message={etat.message} onReessayer={reessayer} />
          ) : (
            <ResultatsIndisponibilites
              technicien={technicien}
              liste={liste}
              occupe={etat.statut === 'chargement'}
              filtree={filtree}
              actions={actionsDeLaListe}
              maintenant={maintenant}
            />
          )}
        </div>
      </div>
    </Section>
  );
}

interface PeriodeDeLaListe {
  /** Bornes telles que tapées dans les champs. */
  saisie: SaisiePeriode;
  /** Message de l'API pour une saisie posée à l'envers ; absent sinon. */
  erreur: string | undefined;
  /** Bornes appliquées à la liste : la dernière saisie posée et valide. */
  bornes: SaisiePeriode;
  changer: (changement: Partial<SaisiePeriode>) => void;
  revenirAuxAVenir: () => void;
  /** Champ « Du », qui reprend le focus quand le bouton « Revenir » disparaît. */
  champDu: RefObject<HTMLInputElement | null>;
}

/**
 * Période choisie pour la liste. Un champ date émet des valeurs intermédiaires pendant la frappe de
 * l'année (« 0002-12-01 », « 0020-12-01 »…) : la période n'est appliquée, et une inversion
 * signalée, qu'une fois la saisie posée, avec le même délai que la recherche des listes.
 */
function usePeriodeDeLaListe(): PeriodeDeLaListe {
  const [saisie, setSaisie] = useState<SaisiePeriode>(SAISIE_PERIODE_VIDE);
  const saisiePosee = useValeurDifferee(saisie);
  const erreur = verifierPeriode(saisiePosee);
  // Une saisie à l'envers n'est pas appliquée : l'API la refuserait (400) avec le même message. La
  // dernière période valide reste affichée pendant la correction, et l'alerte dit pourquoi. État
  // ajusté pendant le rendu (motif React) : un effet afficherait d'abord les bornes périmées.
  const [bornes, setBornes] = useState<SaisiePeriode>(SAISIE_PERIODE_VIDE);
  if (erreur === undefined && !memesBornes(bornes, saisiePosee)) setBornes(saisiePosee);
  const champDu = useRef<HTMLInputElement>(null);

  return {
    saisie,
    erreur,
    bornes,
    changer: (changement) => setSaisie((courante) => ({ ...courante, ...changement })),
    revenirAuxAVenir: () => {
      // Le bouton cliqué disparaît avec le filtre : sans repli, le focus retomberait sur le
      // document et l'utilisateur au clavier devrait retraverser la page (RGAA 12.8).
      champDu.current?.focus();
      setSaisie(SAISIE_PERIODE_VIDE);
    },
    champDu,
  };
}

interface PropsFiltre {
  periode: PeriodeDeLaListe;
  /** Une borne au moins est appliquée : le retour aux indisponibilités à venir est proposé. */
  filtree: boolean;
}

/** Bornes facultatives ; une période posée à l'envers est signalée sur les deux champs, sans appel. */
function FiltrePeriode({ periode, filtree }: PropsFiltre) {
  const { saisie, erreur, changer, revenirAuxAVenir, champDu } = periode;
  const id = useId();
  const idAide = `${id}-aide`;
  const idErreur = `${id}-erreur`;
  const descriptions = erreur ? `${idAide} ${idErreur}` : idAide;
  return (
    // La bordure est portée par un bloc à part : un fieldset bordé incrusterait sa légende dedans.
    <div className="rounded-lg border border-bordure bg-white p-3">
      <fieldset>
        <legend className="text-xs font-medium">Période</legend>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <ChampBorne
            ref={champDu}
            id={`${id}-du`}
            libelle="Du"
            valeur={saisie.du}
            invalide={erreur !== undefined}
            descriptions={descriptions}
            onChanger={(du) => changer({ du })}
          />
          <ChampBorne
            id={`${id}-au`}
            libelle="Au"
            valeur={saisie.au}
            invalide={erreur !== undefined}
            descriptions={descriptions}
            onChanger={(au) => changer({ au })}
          />
          {filtree && (
            <button type="button" onClick={revenirAuxAVenir} className={BOUTON_SECONDAIRE}>
              Revenir aux indisponibilités à venir
            </button>
          )}
        </div>
        <p id={idAide} className="mt-2 text-xs text-gris-texte">
          Sans période, les indisponibilités en cours et à venir sont affichées. Une seule borne
          suffit ; les jours sont ceux de La Réunion.
        </p>
        {erreur && (
          <p id={idErreur} role="alert" className="mt-1 text-xs font-medium text-erreur-texte">
            {erreur}
          </p>
        )}
      </fieldset>
    </div>
  );
}

interface PropsBorne {
  id: string;
  libelle: string;
  valeur: string;
  invalide: boolean;
  descriptions: string;
  onChanger: (valeur: string) => void;
  ref?: Ref<HTMLInputElement>;
}

function ChampBorne({ id, libelle, valeur, invalide, descriptions, onChanger, ref }: PropsBorne) {
  return (
    <label htmlFor={id} className="block text-xs font-medium">
      {libelle}
      <input
        ref={ref}
        id={id}
        type="date"
        max={DERNIER_JOUR_SAISISSABLE}
        value={valeur}
        aria-invalid={invalide || undefined}
        aria-describedby={descriptions}
        onChange={(evenement) => onChanger(evenement.target.value)}
        className={`${CHAMP_DE_FILTRE} tabular-nums aria-invalid:border-erreur`}
      />
    </label>
  );
}

interface PropsResultats {
  technicien: FicheTechnicien;
  liste: Indisponibilite[] | undefined;
  occupe: boolean;
  filtree: boolean;
  actions?: ActionsDeLaFiche<ActionFicheTechnicien>;
  maintenant: () => Date;
}

function ResultatsIndisponibilites({ liste, occupe, filtree, ...reste }: PropsResultats) {
  // Une liste précédente vide ne dit rien de la nouvelle période : on attend sa réponse.
  if (!liste || (occupe && liste.length === 0)) {
    return (
      <p role="status" className="text-sm text-gris-texte">
        Chargement des indisponibilités…
      </p>
    );
  }
  if (liste.length === 0) {
    // Sans role="status" : ce nœud est inséré avec son texte, c'est AnnonceDuTotal qui le lit.
    return (
      <p className="rounded-lg border border-bordure bg-white px-4 py-6 text-center text-sm text-gris-texte">
        {messageAucuneIndisponibilite(filtree)}
      </p>
    );
  }
  return <TableauIndisponibilites liste={liste} occupe={occupe} {...reste} />;
}

/** Annonce d'une réponse : le nombre d'indisponibilités, ou le message qui remplace une liste vide. */
function resultatDeLaListe(liste: Indisponibilite[], filtree: boolean): string {
  if (liste.length === 0) return messageAucuneIndisponibilite(filtree);
  return liste.length === 1 ? '1 indisponibilité' : `${liste.length} indisponibilités`;
}

function messageAucuneIndisponibilite(filtree: boolean): string {
  return filtree
    ? 'Aucune indisponibilité sur cette période.'
    : 'Aucune indisponibilité en cours ou à venir.';
}

interface PropsTableau extends Omit<PropsResultats, 'liste' | 'filtree'> {
  liste: Indisponibilite[];
}

function TableauIndisponibilites({ technicien, liste, occupe, actions, maintenant }: PropsTableau) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bordure bg-white">
      <table className="w-full min-w-150 border-collapse text-left" aria-busy={occupe}>
        <caption className="sr-only">
          Indisponibilités de {nomComplet(technicien)}, par date de début
        </caption>
        <thead>
          <tr className="border-b border-bordure bg-fond">
            {['Début', 'Fin', 'Motif', 'Action'].map((titre) => (
              <th key={titre} scope="col" className={ENTETE_TABLEAU}>
                {titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {liste.map((indisponibilite) => (
            <LigneIndisponibilite
              key={indisponibilite.id}
              indisponibilite={indisponibilite}
              // Supprimable tant qu'elle n'est pas finie : l'API refuse ensuite (400), l'historique la garde.
              // Une fiche archivée n'a pas d'actions : sa liste reste en lecture seule (RG22), même si
              // l'API accepte encore la suppression.
              actions={actions && !estTerminee(indisponibilite, maintenant()) ? actions : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PropsLigne {
  indisponibilite: Indisponibilite;
  /** Absentes quand la suppression n'est pas proposée (technicien archivé, période terminée). */
  actions?: ActionsDeLaFiche<ActionFicheTechnicien>;
}

function LigneIndisponibilite({ indisponibilite, actions }: PropsLigne) {
  const debut = dateHeureMetier(indisponibilite.debut);
  return (
    <tr className="border-b border-bordure last:border-b-0">
      <td className={`${CELLULE_TABLEAU} tabular-nums`}>{debut}</td>
      <td className={`${CELLULE_TABLEAU} tabular-nums`}>{dateHeureMetier(indisponibilite.fin)}</td>
      <td className={CELLULE_TABLEAU}>
        {indisponibilite.motif ?? <span className="text-gris-texte">—</span>}
      </td>
      <td className={CELLULE_TABLEAU}>
        {actions && (
          <BoutonDeLaFiche
            actions={actions}
            action={{ nom: 'suppression-indisponibilite', indisponibilite }}
            destructif
          >
            {/* L'espace hors du span : le nom accessible collerait sinon « Supprimerl’indisponibilité ». */}
            Supprimer <span className="sr-only">l’indisponibilité du {debut}</span>
          </BoutonDeLaFiche>
        )}
      </td>
    </tr>
  );
}
