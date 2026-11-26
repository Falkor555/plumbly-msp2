import { techniciensApi } from '../api/techniciens.api';
import type { FicheTechnicien, Indisponibilite } from '../api/types';
import { FenetreConfirmation } from '../commun/FenetreConfirmation';
import { nomComplet } from '../planning/presentation';
import { FenetreIndisponibilite } from './FenetreIndisponibilite';
import { FenetreTechnicien } from './FenetreTechnicien';
import { periodeLisible } from './indisponibilites';

/** Action de la fiche technicien qui ouvre une fenêtre. */
export type ActionFicheTechnicien =
  | { nom: 'coordonnees' }
  | { nom: 'archivage' }
  | { nom: 'ajout-indisponibilite' }
  | { nom: 'suppression-indisponibilite'; indisponibilite: Indisponibilite };

interface Props {
  action: ActionFicheTechnicien;
  technicien: FicheTechnicien;
  onAnnuler: () => void;
  /** L'API a enregistré l'action : la fenêtre se ferme et la fiche se relit. */
  onTermine: () => void;
}

/** Fenêtre ouverte par une action de la fiche technicien (US11, US12, RG22). */
export function FenetreDeLaFicheTechnicien({ action, technicien, onAnnuler, onTermine }: Props) {
  switch (action.nom) {
    case 'coordonnees':
      return (
        <FenetreTechnicien technicien={technicien} onFermer={onAnnuler} onEnregistre={onTermine} />
      );
    case 'archivage':
      return (
        <ConfirmationArchivage
          technicien={technicien}
          onAnnuler={onAnnuler}
          onTermine={onTermine}
        />
      );
    case 'ajout-indisponibilite':
      return (
        <FenetreIndisponibilite
          technicien={technicien}
          onFermer={onAnnuler}
          onEnregistree={onTermine}
        />
      );
    case 'suppression-indisponibilite':
      return (
        <ConfirmationSuppressionIndisponibilite
          technicien={technicien}
          indisponibilite={action.indisponibilite}
          onAnnuler={onAnnuler}
          onTermine={onTermine}
        />
      );
  }
}

type PropsConfirmation = Omit<Props, 'action'>;

/**
 * RG22 : refusé (409) tant que le technicien a des interventions en cours, ou planifiées à partir
 * d'aujourd'hui. Aucune route ne désarchive un technicien (docs/api.md, 6.6) : c'est définitif.
 */
function ConfirmationArchivage({ technicien, onAnnuler, onTermine }: PropsConfirmation) {
  return (
    <FenetreConfirmation
      titre="Archiver le technicien ?"
      message={
        <>
          <p>
            « {nomComplet(technicien)} » ne recevra plus de tournée et disparaîtra du planning. Sa
            fiche restera consultable, sans modification possible.
          </p>
          <p>
            Son compte utilisateur n’est pas désactivé pour autant : c’est une action distincte de
            l’administrateur.
          </p>
          <p className="font-semibold">L’archivage est définitif : il ne peut pas être annulé.</p>
        </>
      }
      libelleConfirmer="Archiver définitivement"
      libelleEnCours="Archivage en cours…"
      contexteErreur="Archivage du technicien impossible"
      onConfirmer={async () => {
        await techniciensApi.archiver(technicien.id);
        onTermine();
      }}
      onAnnuler={onAnnuler}
    />
  );
}

interface PropsSuppression extends PropsConfirmation {
  indisponibilite: Indisponibilite;
}

/**
 * US12 : le technicien redevient planifiable sur la période. Une indisponibilité déjà terminée est
 * refusée (400) : l'API la garde dans l'historique, et son message s'affiche tel quel.
 */
function ConfirmationSuppressionIndisponibilite({
  technicien,
  indisponibilite,
  onAnnuler,
  onTermine,
}: PropsSuppression) {
  return (
    <FenetreConfirmation
      titre="Supprimer l’indisponibilité ?"
      message={
        <>
          <p>
            Indisponibilité de {nomComplet(technicien)} {periodeLisible(indisponibilite)}
            {indisponibilite.motif ? ` (${indisponibilite.motif})` : ', sans motif'}.
          </p>
          <p>Le technicien pourra de nouveau être planifié sur cette période.</p>
        </>
      }
      libelleConfirmer="Supprimer"
      libelleEnCours="Suppression en cours…"
      contexteErreur="Suppression de l’indisponibilité impossible"
      onConfirmer={async () => {
        await techniciensApi.supprimerIndisponibilite(technicien.id, indisponibilite.id);
        onTermine();
      }}
      onAnnuler={onAnnuler}
    />
  );
}
