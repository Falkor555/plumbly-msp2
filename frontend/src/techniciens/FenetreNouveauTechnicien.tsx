import { type FormEvent, type Ref, type RefObject, useId, useLayoutEffect, useRef } from 'react';
import { techniciensApi } from '../api/techniciens.api';
import type { FicheTechnicien } from '../api/types';
import type { CompteUtilisateur } from '../api/utilisateurs.api';
import { BoutonsDuFormulaire } from '../commun/BoutonsDuFormulaire';
import { BOUTON_SECONDAIRE } from '../commun/classes';
import { Fenetre } from '../commun/Fenetre';
import { ResumeDesErreurs } from '../commun/ResumeDesErreurs';
import { nombreDErreurs } from '../commun/saisie';
import { type EtatChargement, useChargement } from '../commun/useChargement';
import { type Soumission, useSoumission } from '../commun/useSoumission';
import { useSession } from '../session/session';
import { ChampDuCompte, type SourceDuCompte } from './ChampDuCompte';
import { ChampTelephone, ChoixDeLaCouleur } from './ChampsDuTechnicien';
import { lireComptesSansFiche } from './comptesSansFiche';
import {
  type SaisieDuFormulaireTechnicien,
  useSaisieNouveauTechnicien,
} from './useSaisieNouveauTechnicien';
import { versNouveauTechnicien } from './validationTechnicien';

const AIDE_GESTIONNAIRE =
  'Numéro du compte utilisateur de rôle technicien : l’administrateur vous le communique.';
const AIDE_ADMINISTRATEUR = 'Numéro du compte utilisateur de rôle technicien.';
const AUCUN_COMPTE_DISPONIBLE =
  'Aucun compte ne peut recevoir de fiche : chaque compte technicien actif en a déjà une. ' +
  'Créez d’abord le compte de l’employé avec le rôle technicien, ou réactivez-le.';

interface Props {
  onFermer: () => void;
  /** La fiche créée par l'API ; l'appelant ferme la fenêtre et relit la liste. */
  onCreee: (technicien: FicheTechnicien) => void;
}

/**
 * US11 : création de la fiche technicien d'un compte de rôle TECHNICIEN. GET /users est réservé à
 * l'administrateur (403 pour un gestionnaire) : lui choisit le compte dans la liste des comptes
 * sans fiche, le gestionnaire saisit l'identifiant que l'administrateur lui communique.
 */
export function FenetreNouveauTechnicien(props: Props) {
  const { etat } = useSession();
  if (etat.statut === 'connecte' && etat.profil.role === 'ADMIN') {
    return <CreationParLAdministrateur {...props} />;
  }
  return (
    <FenetreDeCreation {...props} source={{ sorte: 'identifiant', aide: AIDE_GESTIONNAIRE }} />
  );
}

function CreationParLAdministrateur(props: Props) {
  // lireComptesSansFiche est une fonction du module : la lecture ne part qu'une fois.
  const { etat } = useChargement(lireComptesSansFiche);
  return <FenetreDeCreation {...props} source={sourceSelonLaLecture(etat)} />;
}

/** Faute de liste (réseau, droits), l'administrateur peut encore saisir l'identifiant du compte. */
function sourceSelonLaLecture(etat: EtatChargement<CompteUtilisateur[]>): SourceDuCompte {
  if (etat.statut === 'chargement') return { sorte: 'chargement' };
  if (etat.statut === 'erreur') {
    return { sorte: 'identifiant', aide: AIDE_ADMINISTRATEUR, echec: etat.message };
  }
  return { sorte: 'liste', comptes: etat.donnees };
}

interface PropsFenetre extends Props {
  source: SourceDuCompte;
}

/**
 * Le titre reçoit le focus à l'ouverture : pour l'administrateur, le premier champ n'existe qu'une
 * fois la liste des comptes lue. Les 400 (compte inexistant, désactivé, d'un autre rôle) et le 409
 * (fiche déjà existante) de l'API s'affichent tels quels, la fenêtre restant ouverte.
 */
function FenetreDeCreation({ source, onFermer, onCreee }: PropsFenetre) {
  const idTitre = useId();
  const titre = useRef<HTMLHeadingElement>(null);
  const saisieDuFormulaire = useSaisieNouveauTechnicien();
  const { formulaire, repliApresEchec, soumettre, ...envoi } = useSoumission(
    'Fiche technicien non créée',
  );
  const enAttente = source.sorte === 'chargement';
  const aucunCompte = source.sorte === 'liste' && source.comptes.length === 0;
  useFocusApresLaLecture(enAttente, titre);

  function creer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const valide = saisieDuFormulaire.valider(source.sorte === 'liste' ? 'liste' : 'identifiant');
    void soumettre(valide, async () => {
      onCreee(await techniciensApi.creer(versNouveauTechnicien(saisieDuFormulaire.saisie)));
    });
  }

  return (
    <Fenetre
      idTitre={idTitre}
      onFermer={onFermer}
      focusInitial={titre}
      fermableParEchap={!envoi.envoiEnCours}
    >
      <EnTete idTitre={idTitre} refTitre={titre} />
      {enAttente || aucunCompte ? (
        <SansFormulaire listeVide={aucunCompte} onFermer={onFermer} />
      ) : (
        <FormulaireDeCreation
          source={source}
          saisieDuFormulaire={saisieDuFormulaire}
          envoi={envoi}
          refFormulaire={formulaire}
          refEnvoi={repliApresEchec}
          onCreer={creer}
          onAnnuler={onFermer}
        />
      )}
    </Fenetre>
  );
}

/**
 * Pendant la lecture des comptes, « Annuler » est le seul contrôle de la fenêtre : le formulaire,
 * ou la saisie de l'identifiant en repli, le remplace à l'arrivée de la réponse. S'il avait le
 * focus, celui-ci retomberait sur le document (RGAA 12.8) : il revient au titre, comme à
 * l'ouverture. Sans compte disponible, le même bouton reste en place, avec le focus.
 */
function useFocusApresLaLecture(enAttente: boolean, titre: RefObject<HTMLElement | null>): void {
  const etaitEnAttente = useRef(enAttente);
  // Effet de mise en page : le focus revient dans la mise à jour même qui retire le bouton.
  useLayoutEffect(() => {
    const lectureTerminee = etaitEnAttente.current && !enAttente;
    etaitEnAttente.current = enAttente;
    if (lectureTerminee && document.activeElement === document.body) titre.current?.focus();
  }, [enAttente, titre]);
}

function EnTete({ idTitre, refTitre }: { idTitre: string; refTitre: Ref<HTMLHeadingElement> }) {
  return (
    <header className="border-b border-bordure px-4 py-4 sm:px-6">
      {/* Cible du focus à l'ouverture, hors de l'ordre de tabulation. */}
      <h2
        id={idTitre}
        ref={refTitre}
        tabIndex={-1}
        className="text-lg font-semibold focus:outline-none"
      >
        Nouveau technicien
      </h2>
      <p className="text-sm text-gris-texte">
        La fiche d’un compte de rôle technicien : il pourra ensuite recevoir des tournées.
      </p>
    </header>
  );
}

/**
 * Pendant la lecture des comptes, puis s'il n'en reste aucun sans fiche. Le même message de statut
 * reste en place d'un cas à l'autre : son nouveau texte est annoncé par les lecteurs d'écran.
 */
function SansFormulaire({ listeVide, onFermer }: { listeVide: boolean; onFermer: () => void }) {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <p role="status" className="text-sm text-gris-texte">
        {listeVide ? AUCUN_COMPTE_DISPONIBLE : 'Chargement des comptes techniciens…'}
      </p>
      <div className="flex justify-end">
        <button type="button" onClick={onFermer} className={BOUTON_SECONDAIRE}>
          {listeVide ? 'Fermer' : 'Annuler'}
        </button>
      </div>
    </div>
  );
}

interface PropsFormulaire {
  source: Exclude<SourceDuCompte, { sorte: 'chargement' }>;
  saisieDuFormulaire: SaisieDuFormulaireTechnicien;
  /** L'état de l'envoi, sans ses références, qui arrivent à part (refFormulaire, refEnvoi). */
  envoi: Pick<Soumission, 'envoiEnCours' | 'refus' | 'erreurServeur'>;
  refFormulaire: Ref<HTMLFormElement>;
  refEnvoi: Ref<HTMLButtonElement>;
  onCreer: (evenement: FormEvent<HTMLFormElement>) => void;
  onAnnuler: () => void;
}

/** Le compte, le téléphone (obligatoires) et la couleur, facultative. */
function FormulaireDeCreation({
  source,
  saisieDuFormulaire,
  envoi,
  refFormulaire,
  refEnvoi,
  onCreer,
  onAnnuler,
}: PropsFormulaire) {
  const { saisie, erreurs, changer } = saisieDuFormulaire;
  const { envoiEnCours } = envoi;
  return (
    <form ref={refFormulaire} noValidate onSubmit={onCreer} className="space-y-4 px-4 py-4 sm:px-6">
      <ChampDuCompte
        source={source}
        valeur={saisie.compte}
        onChanger={(compte) => changer('compte', compte)}
        erreur={erreurs.compte}
        desactive={envoiEnCours}
      />
      <ChampTelephone
        valeur={saisie.telephone}
        onChanger={(telephone) => changer('telephone', telephone)}
        erreur={erreurs.telephone}
        desactive={envoiEnCours}
      />
      <ChoixDeLaCouleur
        couleur={saisie.couleur}
        onChanger={(couleur) => changer('couleur', couleur)}
        desactive={envoiEnCours}
      />
      <ResumeDesErreurs
        key={envoi.refus}
        nombreAuRefus={saisieDuFormulaire.nombreAuRefus}
        restantes={nombreDErreurs(erreurs)}
        erreurServeur={envoi.erreurServeur}
      />
      <BoutonsDuFormulaire
        libelleEnvoi={envoiEnCours ? 'Création en cours…' : 'Créer la fiche'}
        envoiEnCours={envoiEnCours}
        onAnnuler={onAnnuler}
        refEnvoi={refEnvoi}
      />
    </form>
  );
}
