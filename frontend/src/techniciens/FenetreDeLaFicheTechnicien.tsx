import { techniciensApi } from '../api/techniciens.api';
import type { FicheTechnicien } from '../api/types';
import { FenetreConfirmation } from '../commun/FenetreConfirmation';
import { nomComplet } from '../planning/presentation';
import { FenetreTechnicien } from './FenetreTechnicien';

/** Action de la fiche technicien qui ouvre une fenêtre. */
export type ActionFicheTechnicien = { nom: 'coordonnees' } | { nom: 'archivage' };

interface Props {
  action: ActionFicheTechnicien;
  technicien: FicheTechnicien;
  onAnnuler: () => void;
  /** L'API a enregistré l'action : la fenêtre se ferme et la fiche se relit. */
  onTermine: () => void;
}

/** Fenêtre ouverte par une action de la fiche technicien (US11, RG22). */
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
  }
}

/**
 * RG22 : refusé (409) tant que le technicien a des interventions en cours, ou planifiées à partir
 * d'aujourd'hui. Aucune route ne désarchive un technicien (docs/api.md, 6.6) : c'est définitif.
 */
function ConfirmationArchivage({ technicien, onAnnuler, onTermine }: Omit<Props, 'action'>) {
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
