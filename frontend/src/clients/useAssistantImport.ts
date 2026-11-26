import { useState } from 'react';
import { clientsApi } from '../api/clients.api';
import type {
  ChampClient,
  Correspondance,
  DemandeAnalyse,
  DemandeImport,
  RapportImport,
  ReponseAnalyse,
  StrategieDoublons,
} from '../api/types';
import {
  type ChoixSeparateur,
  choisirChamp,
  type ErreurAffichee,
  type FichierLu,
  messageErreurImport,
} from './importClients';
import { useAnalyseImport } from './useAnalyseImport';
import { useFichierAImporter } from './useFichierAImporter';

export type EtapeImport = 'fichier' | 'analyse' | 'compteRendu';

export interface AssistantImport {
  etape: EtapeImport;
  fichier: FichierLu | null;
  separateur: ChoixSeparateur;
  /** Colonnes dont l'utilisateur a changé le champ : seules envoyées à l'API. */
  choix: Correspondance;
  analyse: ReponseAnalyse | null;
  /**
   * Vrai pendant la relecture du fichier avec un autre séparateur : les en-têtes affichés vont
   * changer, une colonne choisie maintenant n'existerait plus pour l'API (400).
   */
  enTetesEnRelecture: boolean;
  strategie: StrategieDoublons;
  rapport: RapportImport | null;
  enCours: 'lecture' | 'analyse' | 'import' | null;
  /** Refus du fichier ou de l'analyse. */
  erreur: ErreurAffichee | null;
  /** Échec de l'import lui-même : l'analyse reste affichée et l'import peut être relancé. */
  erreurImport: string | null;
  choisirFichier: (fichier: File) => void;
  changerSeparateur: (separateur: ChoixSeparateur) => void;
  analyser: () => void;
  changerChamp: (enTete: string, champ: ChampClient | null) => void;
  changerStrategie: (strategie: StrategieDoublons) => void;
  importer: () => void;
  recommencer: () => void;
}

/**
 * État de l'assistant d'import (US31) : fichier lu, analyses successives, import, compte rendu.
 * Rien n'est enregistré avant importer() : les analyses ne font que lire.
 */
export function useAssistantImport(): AssistantImport {
  const lecture = useFichierAImporter();
  const analyse = useAnalyseImport();
  const confirmation = useConfirmationImport();
  const [separateur, setSeparateur] = useState<ChoixSeparateur>('');
  const [strategie, setStrategie] = useState<StrategieDoublons>('IGNORER');
  const { fichier } = lecture;
  const etape = etapeAtteinte(analyse.resultat, confirmation.rapport);
  const enTetesEnRelecture =
    analyse.demandeAnalysee !== null && (analyse.demandeAnalysee.separateur ?? '') !== separateur;

  function lancerAnalyse(demande: DemandeAnalyse, colonne?: string): void {
    confirmation.effacerErreur();
    void analyse.lancer(demande, colonne);
  }

  function changerSeparateur(nouveau: ChoixSeparateur): void {
    setSeparateur(nouveau);
    // Les en-têtes changent avec le séparateur : les colonnes choisies n'existeraient plus (400).
    analyse.changerChoix({});
    if (etape === 'analyse' && fichier) lancerAnalyse(demandeDAnalyse(fichier, nouveau, {}));
  }

  function analyser(): void {
    if (fichier) lancerAnalyse(demandeDAnalyse(fichier, separateur, analyse.choix));
    else lecture.refuser({ message: 'Choisissez d’abord un fichier CSV.' });
  }

  function changerChamp(enTete: string, champ: ChampClient | null): void {
    if (!fichier || enTetesEnRelecture) return;
    const suivant = choisirChamp(analyse.choix, enTete, champ);
    analyse.changerChoix(suivant);
    lancerAnalyse(demandeDAnalyse(fichier, separateur, suivant), enTete);
  }

  function importer(): void {
    if (!analyse.demandeAnalysee || analyse.enAnalyse) return;
    // La correspondance et le séparateur de la dernière analyse : ce que l'utilisateur a vérifié.
    void confirmation.importer({ ...analyse.demandeAnalysee, strategieDoublons: strategie });
  }

  /** Assistant vide, à l'étape du fichier ; le séparateur choisi est gardé. */
  function recommencer(): void {
    lecture.oublier();
    analyse.oublier();
    confirmation.effacerErreur();
  }

  return {
    etape,
    fichier,
    separateur,
    choix: analyse.choix,
    analyse: analyse.resultat,
    enTetesEnRelecture,
    strategie,
    rapport: confirmation.rapport,
    enCours: travailEnCours(lecture.enLecture, analyse.enAnalyse, confirmation.enImport),
    erreur: lecture.refus ?? analyse.refus,
    erreurImport: confirmation.erreur,
    choisirFichier: (choisi) => {
      // Une analyse ou une lecture encore en cours porte sur le fichier précédent : on l'oublie.
      recommencer();
      void lecture.choisir(choisi);
    },
    changerSeparateur,
    analyser,
    changerChamp,
    changerStrategie: setStrategie,
    importer,
    recommencer,
  };
}

interface ConfirmationImport {
  rapport: RapportImport | null;
  enImport: boolean;
  erreur: string | null;
  importer: (demande: DemandeImport) => Promise<void>;
  effacerErreur: () => void;
}

/** Étape 3 de l'import (US31) : le seul appel qui enregistre, après le clic de l'utilisateur. */
function useConfirmationImport(): ConfirmationImport {
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const [enImport, setEnImport] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function importer(demande: DemandeImport): Promise<void> {
    if (enImport) return;
    setEnImport(true);
    setErreur(null);
    try {
      setRapport(await clientsApi.importer(demande));
    } catch (cause) {
      setErreur(messageErreurImport(cause));
    } finally {
      setEnImport(false);
    }
  }

  return { rapport, enImport, erreur, importer, effacerErreur: () => setErreur(null) };
}

function etapeAtteinte(analyse: ReponseAnalyse | null, rapport: RapportImport | null): EtapeImport {
  if (rapport) return 'compteRendu';
  return analyse ? 'analyse' : 'fichier';
}

function travailEnCours(
  enLecture: boolean,
  enAnalyse: boolean,
  enImport: boolean,
): AssistantImport['enCours'] {
  if (enLecture) return 'lecture';
  if (enAnalyse) return 'analyse';
  return enImport ? 'import' : null;
}

/** Les clés absentes laissent l'API détecter le séparateur et proposer les colonnes. */
function demandeDAnalyse(
  fichier: FichierLu,
  separateur: ChoixSeparateur,
  choix: Correspondance,
): DemandeAnalyse {
  const demande: DemandeAnalyse = { contenu: fichier.contenu };
  if (separateur !== '') demande.separateur = separateur;
  if (Object.keys(choix).length > 0) demande.correspondance = choix;
  return demande;
}
