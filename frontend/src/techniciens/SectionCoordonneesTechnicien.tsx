import type { FicheTechnicien } from '../api/types';
import {
  type ActionsDeLaFiche,
  BoutonDeLaFiche,
  LIEN_FICHE,
  Rubrique,
  Section,
} from '../commun/ElementsDeLaFiche';
import { lienTelephone } from '../commun/liens';
import { telephoneLisible } from '../commun/telephone';
import type { ActionFicheTechnicien } from './FenetreDeLaFicheTechnicien';
import { PastilleCouleur } from './PastilleCouleur';

const GRILLE = 'mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2';

interface Props {
  technicien: FicheTechnicien;
  /** Absentes pour un technicien archivé : sa fiche ne se modifie plus (RG22). */
  actions?: ActionsDeLaFiche<ActionFicheTechnicien>;
}

/**
 * Coordonnées du technicien (US11). Celles du compte utilisateur s'affichent sans pouvoir être
 * modifiées ici : l'API les refuse dans PATCH /technicians (400), seul l'administrateur les change.
 */
export function SectionCoordonneesTechnicien({ technicien, actions }: Props) {
  return (
    <Section
      titre="Coordonnées"
      action={
        actions && (
          <BoutonDeLaFiche actions={actions} action={{ nom: 'coordonnees' }}>
            Modifier le téléphone et la couleur
          </BoutonDeLaFiche>
        )
      }
    >
      <div className="grid gap-6 px-4 py-4 text-sm md:grid-cols-2">
        <div>
          <h3 className="font-semibold">Compte utilisateur</h3>
          <p className="text-xs text-gris-texte">
            Nom, prénom et e-mail viennent du compte de l’employé, modifiable par l’administrateur.
          </p>
          <dl className={GRILLE}>
            <Rubrique titre="Nom">{technicien.nom}</Rubrique>
            <Rubrique titre="Prénom">{technicien.prenom}</Rubrique>
            <Rubrique titre="E-mail">
              <a href={`mailto:${technicien.email}`} className={`${LIEN_FICHE} break-all`}>
                {technicien.email}
              </a>
            </Rubrique>
            <Rubrique titre="État du compte">
              {technicien.compteActif ? 'Actif' : 'Désactivé'}
            </Rubrique>
          </dl>
        </div>
        <div>
          <h3 className="font-semibold">Fiche technicien</h3>
          <dl className={GRILLE}>
            <Rubrique titre="Téléphone">
              <a
                href={lienTelephone(technicien.telephone)}
                className={`${LIEN_FICHE} tabular-nums`}
              >
                {telephoneLisible(technicien.telephone)}
              </a>
            </Rubrique>
            <Rubrique titre="Couleur du planning">
              <span className="inline-flex items-center gap-2">
                <PastilleCouleur couleur={technicien.couleurPlanning} />
                <span className="font-mono">{technicien.couleurPlanning}</span>
              </span>
            </Rubrique>
          </dl>
        </div>
      </div>
    </Section>
  );
}
