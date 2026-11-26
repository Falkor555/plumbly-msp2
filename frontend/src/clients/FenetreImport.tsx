import { useId, useLayoutEffect, useRef } from 'react';
import { BOUTON_SECONDAIRE } from '../commun/classes';
import { Fenetre } from '../commun/Fenetre';
import { CompteRenduImport } from './CompteRenduImport';
import { EtapeAnalyse } from './EtapeAnalyse';
import { EtapeFichier } from './EtapeFichier';
import { type EtapeImport, useAssistantImport } from './useAssistantImport';

const ETAPES: Record<EtapeImport, { numero: number; titre: string }> = {
  fichier: { numero: 1, titre: 'Choisir le fichier' },
  analyse: { numero: 2, titre: 'Vérifier l’analyse' },
  compteRendu: { numero: 3, titre: 'Compte rendu de l’import' },
};

interface Props {
  /** Vrai si un import a eu lieu : la liste doit alors être relue, et seulement dans ce cas. */
  onFermer: (importEffectue: boolean) => void;
}

/**
 * US31 : assistant d'import des clients depuis un fichier CSV, en trois étapes. Le titre de
 * chaque étape reçoit le focus, pour que le lecteur d'écran annonce où en est l'utilisateur.
 */
export function FenetreImport({ onFermer }: Props) {
  const idTitre = useId();
  const idDescription = useId();
  const titre = useRef<HTMLHeadingElement>(null);
  const assistant = useAssistantImport();
  const { etape, analyse, rapport } = assistant;
  const importEnCours = assistant.enCours === 'import';
  const fermer = () => onFermer(rapport !== null);
  const numeroDEtape = `Étape ${ETAPES[etape].numero} sur 3`;
  const etapeAffichee = useRef(etape);

  // Effet de mise en page : le titre prend le focus dans la mise à jour même qui change d'étape.
  // L'étape change à la réponse de l'API (analyse, import, refus), et react-dom 19 diffère alors
  // un effet ordinaire dans une tâche du Scheduler : un test lirait le focus avant qu'il soit posé.
  useLayoutEffect(() => {
    // À l'ouverture, c'est Fenetre qui pose le focus initial, dans un effet ordinaire, après avoir
    // retenu l'élément à qui le rendre à la fermeture : posé ici avant elle, le titre prendrait
    // cette place et le bouton « Importer » ne retrouverait pas le focus.
    if (etapeAffichee.current === etape) return;
    etapeAffichee.current = etape;
    titre.current?.focus();
  }, [etape]);

  return (
    <Fenetre
      idTitre={idTitre}
      idDescription={idDescription}
      onFermer={fermer}
      focusInitial={titre}
      fermableParEchap={!importEnCours}
      large
    >
      <header className="flex items-start justify-between gap-3 border-b border-bordure px-4 py-4 sm:px-6">
        <div>
          {/* Le nom reprend le texte affiché, ponctué : sur deux lignes, les deux parties se
              liraient d'un seul tenant. */}
          <h2
            id={idTitre}
            ref={titre}
            tabIndex={-1}
            aria-label={`${numeroDEtape} : ${ETAPES[etape].titre}`}
            className="focus:outline-none"
          >
            <span className="block text-xs font-semibold tracking-wide text-gris-texte uppercase">
              {numeroDEtape}
            </span>
            <span className="block text-lg font-semibold">{ETAPES[etape].titre}</span>
          </h2>
          <p id={idDescription} className="text-sm text-gris-texte">
            Import de clients depuis un fichier CSV.
          </p>
        </div>
        <button
          type="button"
          onClick={fermer}
          disabled={importEnCours}
          className={BOUTON_SECONDAIRE}
        >
          Fermer
        </button>
      </header>
      <div className="px-4 py-4 sm:px-6">
        {etape === 'fichier' && <EtapeFichier {...assistant} />}
        {etape === 'analyse' && analyse && <EtapeAnalyse {...assistant} analyse={analyse} />}
        {etape === 'compteRendu' && rapport && (
          <CompteRenduImport rapport={rapport} onFermer={fermer} />
        )}
      </div>
    </Fenetre>
  );
}
