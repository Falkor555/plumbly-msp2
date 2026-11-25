import { useState } from 'react';
import { clientsApi } from '../api/clients.api';
import type { CriteresClients } from '../api/types';
import { messageErreur } from '../commun/messageErreur';

export interface ExportClients {
  enCours: boolean;
  /** Refus de l'API (400 au-delà de 5 000 lignes) affiché tel quel, ou texte générique. */
  erreur: string | null;
  exporter: (criteres: CriteresClients) => void;
  /** Le refus porte sur les critères de l'export : il ne vaut plus quand la page change. */
  effacerErreur: () => void;
}

/**
 * US32 : téléchargement de la liste en CSV avec les critères affichés. Un seul export à la fois :
 * un second clic pendant le téléchargement est sans effet.
 */
export function useExportClients(onExporte: (nomFichier: string) => void): ExportClients {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function exporter(criteres: CriteresClients): Promise<void> {
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      onExporte(await clientsApi.exporter(criteres));
    } catch (cause) {
      setErreur(messageErreur(cause, 'Export des clients impossible'));
    } finally {
      setEnCours(false);
    }
  }

  return {
    enCours,
    erreur,
    exporter: (criteres) => void exporter(criteres),
    effacerErreur: () => setErreur(null),
  };
}
