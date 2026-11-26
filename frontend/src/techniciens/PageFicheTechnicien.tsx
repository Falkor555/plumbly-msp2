import { type Ref, useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { techniciensApi } from '../api/techniciens.api';
import type { FicheTechnicien } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { BADGE, CLASSES_ARCHIVE } from '../commun/classes';
import { dateMetier } from '../commun/dates';
import { type ActionsDeLaFiche, BoutonDeLaFiche, LIEN_FICHE } from '../commun/ElementsDeLaFiche';
import { lireIdentifiant } from '../commun/identifiant';
import { PageIntrouvable } from '../commun/PageIntrouvable';
import { useArriveeSurLaPage } from '../commun/useArriveeSurLaPage';
import { useChargement } from '../commun/useChargement';
import { useFocusApresRelecture } from '../commun/useFocusApresRelecture';
import { useReessai } from '../commun/useReessai';
import { ZoneAnnonce } from '../commun/ZoneAnnonce';
import { nomComplet } from '../planning/presentation';
import {
  type ActionFicheTechnicien,
  FenetreDeLaFicheTechnicien,
} from './FenetreDeLaFicheTechnicien';
import { PastilleCouleur } from './PastilleCouleur';
import { initiales } from './presentation';
import { SectionCoordonneesTechnicien } from './SectionCoordonneesTechnicien';
import {
  type RelectureDesIndisponibilites,
  SectionIndisponibilites,
} from './SectionIndisponibilites';

/** Message lu après chaque enregistrement réussi depuis la fiche. */
const ANNONCES: Record<ActionFicheTechnicien['nom'], string> = {
  coordonnees: 'Fiche enregistrée.',
  archivage: 'Technicien archivé : sa fiche est désormais en lecture seule.',
  'ajout-indisponibilite': 'Indisponibilité ajoutée.',
  'suppression-indisponibilite': 'Indisponibilité supprimée.',
};

interface PropsPage {
  /** Horloge, injectable par les tests : une indisponibilité terminée ne se supprime plus (US12). */
  maintenant?: () => Date;
}

/** US11 : fiche du technicien désigné par l'adresse /techniciens/:id. */
export function PageFicheTechnicien({ maintenant = () => new Date() }: PropsPage) {
  const { id } = useParams();
  const identifiant = id === undefined ? null : lireIdentifiant(id);
  if (identifiant === null) {
    return (
      <PageIntrouvable
        retour={{ vers: '/techniciens', libelle: 'Retour à la liste des techniciens' }}
      />
    );
  }
  // La clé repart d'un état neuf quand l'historique du navigateur passe d'une fiche à une autre :
  // sans elle, la fiche précédente et son message de succès resteraient affichés pendant la lecture.
  return <FicheDuTechnicien key={identifiant} id={identifiant} maintenant={maintenant} />;
}

interface PropsFiche {
  id: number;
  maintenant: () => Date;
}

/** Fiche d'un technicien, archivé ou non. */
function FicheDuTechnicien({ id, maintenant }: PropsFiche) {
  const charger = useCallback((signal: AbortSignal) => techniciensApi.consulter(id, signal), [id]);
  const { etat, recharger, dernieresDonnees } = useChargement<FicheTechnicien>(charger);
  // Après une modification, la fiche relue remplace l'ancienne sans vider la page.
  const technicien = etat.statut === 'pret' ? etat.donnees : dernieresDonnees;
  const { zoneDeRepli, reessayer } = useReessai<HTMLElement>(recharger);
  useArriveeSurLaPage(zoneDeRepli);

  return (
    // Cible du focus à l'arrivée et après « Réessayer » ; hors de l'ordre de tabulation.
    <main
      ref={zoneDeRepli}
      tabIndex={-1}
      className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 focus:outline-none md:px-8"
    >
      <Link to="/techniciens" className={`${LIEN_FICHE} text-sm`}>
        Retour à la liste des techniciens
      </Link>
      {etat.statut !== 'erreur' && technicien ? (
        <ContenuFiche
          technicien={technicien}
          relectureEnCours={etat.statut === 'chargement'}
          onModifie={recharger}
          maintenant={maintenant}
        />
      ) : (
        // Tant que le nom n'est pas connu, la page garde un titre de niveau 1 générique.
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Fiche technicien</h1>
          {etat.statut === 'erreur' ? (
            <AlerteChargement message={etat.message} onReessayer={reessayer} />
          ) : (
            <p role="status" className="text-sm text-gris-texte">
              Chargement de la fiche du technicien…
            </p>
          )}
        </>
      )}
    </main>
  );
}

interface PropsContenu {
  technicien: FicheTechnicien;
  relectureEnCours: boolean;
  /** Une action a été enregistrée : la fiche est relue. */
  onModifie: () => void;
  maintenant: () => Date;
}

const PREMIERE_LECTURE: RelectureDesIndisponibilites = { version: 0, focaliserLeTitre: false };

/**
 * Assemble la fiche et garde l'état partagé par ses sections : la fenêtre ouverte, le message de
 * succès et le focus à rendre après la relecture. Un technicien archivé est en lecture seule :
 * aucune action ne s'affiche (RG22), pas même sur ses indisponibilités.
 */
function ContenuFiche({ technicien, relectureEnCours, onModifie, maintenant }: PropsContenu) {
  const [action, setAction] = useState<ActionFicheTechnicien | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [relecture, setRelecture] = useState(PREMIERE_LECTURE);
  const titre = useRef<HTMLHeadingElement>(null);
  const focaliserApresRelecture = useFocusApresRelecture(technicien);
  const actions: ActionsDeLaFiche<ActionFicheTechnicien> | undefined = technicien.archive
    ? undefined
    : {
        ouvrir: (choisie) => {
          setAnnonce(null);
          setAction(choisie);
        },
        inactives: relectureEnCours,
      };

  function terminer(terminee: ActionFicheTechnicien) {
    setAction(null);
    setAnnonce(ANNONCES[terminee.nom]);
    if (
      terminee.nom === 'ajout-indisponibilite' ||
      terminee.nom === 'suppression-indisponibilite'
    ) {
      // Seule la liste des indisponibilités change : la fiche elle-même n'est pas relue.
      setRelecture(({ version }) => ({
        version: version + 1,
        focaliserLeTitre: terminee.nom === 'suppression-indisponibilite',
      }));
      return;
    }
    if (terminee.nom === 'archivage') focaliserApresRelecture(titre);
    onModifie();
  }

  return (
    <>
      <EnTeteFiche technicien={technicien} refTitre={titre} actions={actions} />
      <ZoneAnnonce>{annonce}</ZoneAnnonce>
      <SectionCoordonneesTechnicien technicien={technicien} actions={actions} />
      <SectionIndisponibilites
        technicien={technicien}
        actions={actions}
        relecture={relecture}
        maintenant={maintenant}
      />
      {action && (
        <FenetreDeLaFicheTechnicien
          action={action}
          technicien={technicien}
          onAnnuler={() => setAction(null)}
          onTermine={() => terminer(action)}
        />
      )}
    </>
  );
}

interface PropsEnTete {
  technicien: FicheTechnicien;
  refTitre: Ref<HTMLHeadingElement>;
  /** Absentes pour un technicien archivé. */
  actions?: ActionsDeLaFiche<ActionFicheTechnicien>;
}

function EnTeteFiche({ technicien, refTitre, actions }: PropsEnTete) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <PastilleCouleur couleur={technicien.couleurPlanning} texte={initiales(technicien)} />
          {/* Cible du focus après l'archivage, hors de l'ordre de tabulation. */}
          <h1
            ref={refTitre}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight focus:outline-none"
          >
            {nomComplet(technicien)}
          </h1>
          {technicien.archive && <span className={`${BADGE} ${CLASSES_ARCHIVE}`}>Archivé</span>}
          {!technicien.compteActif && (
            <span className={`${BADGE} ${CLASSES_ARCHIVE}`}>Compte désactivé</span>
          )}
        </div>
        {technicien.archive && technicien.archiveLe && (
          <p className="rounded border border-bordure bg-gray-100 px-3 py-2 text-sm text-gris-texte">
            Technicien archivé le {dateMetier(technicien.archiveLe)} : il ne figure plus dans le
            planning ni dans la liste des techniciens en service, mais sa fiche reste consultable.
          </p>
        )}
      </div>
      {actions && (
        <BoutonDeLaFiche actions={actions} action={{ nom: 'archivage' }} destructif>
          Archiver le technicien
        </BoutonDeLaFiche>
      )}
    </header>
  );
}
