import { useRef, useState } from 'react';
import { clientsApi } from '../api/clients.api';
import type { Correspondance, DemandeAnalyse, ReponseAnalyse } from '../api/types';
import {
  type ErreurAffichee,
  manqueUnChampObligatoire,
  messageErreurAnalyse,
} from './importClients';

export interface AnalyseImport {
  resultat: ReponseAnalyse | null;
  /** Demande qui a produit le résultat affiché : c'est elle que l'import renverra. */
  demandeAnalysee: DemandeAnalyse | null;
  /** Colonnes dont l'utilisateur a changé le champ : seules envoyées à l'API. */
  choix: Correspondance;
  enAnalyse: boolean;
  refus: ErreurAffichee | null;
  /** colonne : en-tête dont le changement a motivé l'analyse, pour lui rattacher un refus. */
  lancer: (demande: DemandeAnalyse, colonne?: string) => Promise<void>;
  changerChoix: (choix: Correspondance) => void;
  oublier: () => void;
}

const AIDE_RENOMMER =
  'Renommez la colonne dans votre fichier (par exemple « telephone », « rue », « code_postal », « ville », « nom » ou « raison_sociale »), enregistrez-le, puis choisissez-le de nouveau.';
const AIDE_CHOISIR = 'Choisissez une colonne pour ce champ dans le tableau de correspondance.';

/**
 * Étape 2 de l'import (US31) : analyses successives du fichier (POST /clients/import/analysis),
 * qui ne font que lire. Un refus portant sur tout le fichier ramène à l'étape du fichier.
 */
export function useAnalyseImport(): AnalyseImport {
  const [resultat, setResultat] = useState<ReponseAnalyse | null>(null);
  const [demandeAnalysee, setDemandeAnalysee] = useState<DemandeAnalyse | null>(null);
  const [choix, setChoix] = useState<Correspondance>({});
  const [enAnalyse, setEnAnalyse] = useState(false);
  const [refus, setRefus] = useState<ErreurAffichee | null>(null);
  // Les analyses se suivent au fil des choix : seule la réponse de la dernière envoyée compte,
  // une réponse plus lente d'un choix précédent ne doit pas l'écraser.
  const derniereAnalyse = useRef(0);

  async function lancer(demande: DemandeAnalyse, colonne?: string): Promise<void> {
    const numero = ++derniereAnalyse.current;
    // Un refus après un changement de fichier ou de séparateur porte sur tout le fichier : il se
    // corrige à l'étape du fichier. Après un changement de colonne, il se corrige dans le tableau.
    const auNiveauDuFichier =
      demandeAnalysee === null || demande.separateur !== demandeAnalysee.separateur;
    setEnAnalyse(true);
    setRefus(null);
    try {
      const reponse = await clientsApi.analyserImport(demande);
      if (numero !== derniereAnalyse.current) return;
      setResultat(reponse);
      setDemandeAnalysee(demande);
    } catch (cause) {
      if (numero !== derniereAnalyse.current) return;
      setRefus(erreurDAnalyse(cause, auNiveauDuFichier, colonne));
      if (auNiveauDuFichier) effacerLAnalyse();
    } finally {
      if (numero === derniereAnalyse.current) setEnAnalyse(false);
    }
  }

  function effacerLAnalyse(): void {
    setResultat(null);
    setDemandeAnalysee(null);
    setChoix({});
  }

  function oublier(): void {
    derniereAnalyse.current++;
    effacerLAnalyse();
    setRefus(null);
    setEnAnalyse(false);
  }

  return {
    resultat,
    demandeAnalysee,
    choix,
    enAnalyse,
    refus,
    lancer,
    changerChoix: setChoix,
    oublier,
  };
}

function erreurDAnalyse(
  cause: unknown,
  auNiveauDuFichier: boolean,
  colonne: string | undefined,
): ErreurAffichee {
  const erreur: ErreurAffichee = { message: messageErreurAnalyse(cause) };
  if (manqueUnChampObligatoire(cause)) {
    erreur.aide = auNiveauDuFichier ? AIDE_RENOMMER : AIDE_CHOISIR;
  }
  // Revenu à l'étape du fichier, l'utilisateur ne voit plus le tableau des colonnes.
  if (!auNiveauDuFichier && colonne !== undefined) erreur.colonne = colonne;
  return erreur;
}
