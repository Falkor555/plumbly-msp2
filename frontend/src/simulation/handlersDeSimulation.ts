import type { HttpHandler } from 'msw';
import type { DateIso } from '../api/types';
import { COMPTES_DEMONSTRATION } from './comptesDemonstration';
import type { JeuDeDemonstration } from './donneesDemonstration';
import { creerHandlersAuthentification } from './handlersAuthentification';
import { creerHandlersClients, creerSequencesDesClients } from './handlersClients';
import { creerHandlersExportImport } from './handlersExportImport';
import { creerHandlersInterventions } from './handlersInterventions';
import { creerHandlersPlanning } from './handlersPlanning';
import { creerHandlersTechniciens } from './handlersTechniciens';

export interface OptionsDeSimulation {
  urlApi: (chemin: string) => string;
  aujourdhui: () => DateIso;
  maintenant: () => Date;
}

/**
 * Tous les faux serveurs de l'API sur un même jeu de démonstration, dans l'ordre où MSW doit les
 * essayer : ceux de npm run dev:simule (demarrerSimulation.ts) et ceux du parcours simulé des tests
 * (parcoursSimule.test.tsx), qui ne peuvent donc pas diverger.
 */
export function creerHandlersDeSimulation(
  jeu: JeuDeDemonstration,
  options: OptionsDeSimulation,
): HttpHandler[] {
  // L'import crée des clients et des adresses comme les routes des clients : mêmes séquences.
  const sequences = creerSequencesDesClients(jeu);
  return [
    // En premier : la connexion et le profil conditionnent l'accès à tous les autres écrans.
    ...creerHandlersAuthentification(COMPTES_DEMONSTRATION, options),
    ...creerHandlersPlanning(jeu, options),
    ...creerHandlersInterventions(jeu, options),
    // Avant les clients, sinon GET /clients/:id prendrait GET /clients/export (voir le fichier).
    ...creerHandlersExportImport(jeu, { ...options, sequences }),
    ...creerHandlersClients(jeu, { ...options, sequences }),
    ...creerHandlersTechniciens(jeu, options),
  ];
}
