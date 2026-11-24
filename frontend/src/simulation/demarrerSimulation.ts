import { setupWorker } from 'msw/browser';
import { jourMetier, lundiDeLaSemaine } from '../commun/dates';
import {
  creerJeuDeDemonstration,
  fabriquerIntervention,
  type JeuDeDemonstration,
  planifier,
} from './donneesDemonstration';
import { creerHandlersPlanning } from './handlersPlanning';

const URL_API = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');

/**
 * Mode simulé (npm run dev:simule, développement uniquement) : MSW répond aux appels de l'API dans le navigateur
 * avec les données de démonstration, pour voir les écrans tant que l'authentification (#13)
 * et la liste des interventions (#17) ne sont pas livrées.
 */
export async function demarrerSimulation(): Promise<void> {
  const aujourdhui = (): string => jourMetier(new Date());
  const jeu = creerJeuDeDemonstration(lundiDeLaSemaine(aujourdhui()));
  ajouterTourneeDuJour(jeu, aujourdhui());
  const handlers = creerHandlersPlanning(jeu, {
    urlApi: (chemin) => `${URL_API}${chemin}`,
    aujourdhui,
  });
  await setupWorker(...handlers).start({ onUnhandledFrame: 'bypass' });
  console.info('[Plumbly] API simulée par MSW : données de démonstration.');
}

/** Pour que « Ma tournée du jour » (/ma-tournee) ait toujours quelque chose à montrer. */
function ajouterTourneeDuJour(jeu: JeuDeDemonstration, jour: string): void {
  const technicien = jeu.techniciens[0];
  if (technicien.tournees.some(({ dateTournee }) => dateTournee === jour)) return;
  const visite = planifier(
    fabriquerIntervention({
      id: 6,
      client: 'Mme Baret',
      type: 'Entretien chaudière',
      ville: 'Saint-Pierre',
      dureeEstimeeMin: 60,
    }),
    jour,
    '08:30',
    1,
  );
  const fuite = planifier(
    fabriquerIntervention({
      id: 7,
      client: 'Garage Hoarau',
      typeClient: 'PROFESSIONNEL',
      type: 'Recherche de fuite',
      ville: 'Le Tampon',
      dureeEstimeeMin: 90,
      urgence: 'URGENTE',
    }),
    jour,
    '10:30',
    2,
  );
  fuite.adresse = {
    ...fuite.adresse,
    complement: 'Atelier au fond de la cour',
    infosAcces: 'Sonner au portail bleu',
  };
  technicien.tournees.push({ id: 11, dateTournee: jour, interventions: [visite, fuite] });
}
