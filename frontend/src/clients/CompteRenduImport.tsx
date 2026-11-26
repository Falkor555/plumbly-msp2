import type { RapportImport } from '../api/types';
import { BOUTON_PRINCIPAL } from '../commun/classes';
import { Compteurs, type LigneDetaillee, TableauDesLignes } from './ElementsImport';

interface Props {
  rapport: RapportImport;
  onFermer: () => void;
}

/** Étape 3 de l'import (US31) : compteurs et détail des lignes qui n'ont pas été enregistrées. */
export function CompteRenduImport({ rapport, onFermer }: Props) {
  const { totaux } = rapport;
  const rejetees: LigneDetaillee[] = [];
  const ignorees: LigneDetaillee[] = [];
  for (const ligne of rapport.lignes) {
    if (ligne.resultat === 'REJETE')
      rejetees.push({ numero: ligne.numero, messages: ligne.erreurs });
    if (ligne.resultat === 'IGNORE')
      ignorees.push({ numero: ligne.numero, messages: [ligne.motif] });
  }
  return (
    <div className="space-y-6">
      <Compteurs
        compteurs={[
          { libelle: 'Créés', valeur: totaux.crees },
          { libelle: 'Mis à jour', valeur: totaux.misAJour },
          { libelle: 'Ignorés', valeur: totaux.ignores },
          { libelle: 'Rejetés', valeur: totaux.rejetes },
        ]}
      />
      {rejetees.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-base font-semibold">Lignes rejetées</h3>
          <TableauDesLignes
            legende="Lignes rejetées : numéro de la ligne dans le fichier et motifs du rejet"
            enteteDetail="Motifs"
            lignes={rejetees}
          />
        </section>
      )}
      {ignorees.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-base font-semibold">Doublons ignorés</h3>
          <TableauDesLignes
            legende="Doublons ignorés : numéro de la ligne dans le fichier et motif"
            enteteDetail="Motif"
            lignes={ignorees}
          />
        </section>
      )}
      <div className="flex justify-end border-t border-bordure pt-4">
        <button type="button" onClick={onFermer} className={BOUTON_PRINCIPAL}>
          Fermer et revenir à la liste
        </button>
      </div>
    </div>
  );
}
