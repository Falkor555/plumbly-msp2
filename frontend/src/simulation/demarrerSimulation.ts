import { setupWorker } from 'msw/browser';
import type { Intervention } from '../api/types';
import { jourMetier, lundiDeLaSemaine, versInstant } from '../commun/dates';
import {
  CLIENT_EXPEDIT_PAYET,
  CLIENT_GARAGE_HOARAU,
  CLIENT_JOSIANE_BARET,
  CLIENT_YOLANDE_GRONDIN,
} from './clientsDemonstration';
import { COMPTES_DEMONSTRATION } from './comptesDemonstration';
import {
  chez,
  creerJeuDeDemonstration,
  fabriquerInterventionChez,
  type JeuDeDemonstration,
  planifier,
} from './donneesDemonstration';
import { creerHandlersAuthentification } from './handlersAuthentification';
import { creerHandlersClients } from './handlersClients';
import { creerHandlersInterventions } from './handlersInterventions';
import { creerHandlersPlanning } from './handlersPlanning';
import { creerHandlersTechniciens } from './handlersTechniciens';

const URL_API = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');

/**
 * Mode simulé (npm run dev:simule, développement uniquement) : MSW répond aux appels de l'API dans le navigateur
 * avec les données de démonstration et une connexion simulée (comptesDemonstration.ts), pour
 * parcourir tous les écrans sans back-end.
 */
export async function demarrerSimulation(): Promise<void> {
  const maintenant = (): Date => new Date();
  const aujourdhui = (): string => jourMetier(maintenant());
  const jeu = creerJeuDeDemonstration(lundiDeLaSemaine(aujourdhui()));
  ajouterTourneeDuJour(jeu, aujourdhui());
  const options = { urlApi: (chemin: string) => `${URL_API}${chemin}`, aujourdhui, maintenant };
  const handlers = [
    // En premier : la connexion et le profil conditionnent l'accès à tous les autres écrans.
    ...creerHandlersAuthentification(COMPTES_DEMONSTRATION, options),
    ...creerHandlersPlanning(jeu, options),
    ...creerHandlersInterventions(jeu, options),
    ...creerHandlersClients(jeu, options),
    ...creerHandlersTechniciens(jeu, options),
  ];
  await setupWorker(...handlers).start({ onUnhandledFrame: 'bypass' });
  console.info('[Plumbly] API simulée par MSW : données de démonstration.');
}

/**
 * Pour que « Ma tournée du jour » (/ma-tournee) ait toujours quelque chose à montrer : une
 * étape de chaque état (terminée et signée, terminée sans signature, en cours, planifiée).
 */
function ajouterTourneeDuJour(jeu: JeuDeDemonstration, jour: string): void {
  const technicien = jeu.techniciens[0];
  // Le lundi, la démonstration du planning a déjà une tournée ce jour-là : elle est remplacée,
  // pour que les quatre états restent visibles quel que soit le jour.
  technicien.tournees = technicien.tournees.filter(({ dateTournee }) => dateTournee !== jour);
  const signee = terminee(
    planifier(
      fabriquerInterventionChez(...chez(jeu.clients, CLIENT_JOSIANE_BARET), {
        id: 6,
        type: 'Entretien chaudière',
        dureeEstimeeMin: 60,
      }),
      jour,
      '07:30',
      1,
    ),
    jour,
    'Chaudière nettoyée, joint du brûleur remplacé.',
  );
  signee.signature = { nomSignataire: 'Josiane Baret', signeeLe: signee.termineeLe as string };
  jeu.signatures[signee.id] = {
    ...signee.signature,
    auteur: { id: technicien.id, nom: technicien.nom, prenom: technicien.prenom },
    empreinte: '3f8a'.repeat(16),
    integre: true,
    image: dessinerSignatureDeDemonstration(),
  };
  const sansSignature = terminee(
    planifier(
      fabriquerInterventionChez(...chez(jeu.clients, CLIENT_EXPEDIT_PAYET), {
        id: 8,
        type: 'Débouchage',
        dureeEstimeeMin: 45,
      }),
      jour,
      '09:00',
      2,
    ),
    jour,
    'Évier débouché. Client absent à la fin : pas de signature.',
  );
  const enCours: Intervention = {
    ...planifier(
      fabriquerInterventionChez(...chez(jeu.clients, CLIENT_YOLANDE_GRONDIN), {
        id: 9,
        type: 'Remplacement de robinet',
        dureeEstimeeMin: 60,
      }),
      jour,
      '10:30',
      3,
    ),
    statut: 'EN_COURS',
    demarreeLe: versInstant(jour, '10:35'),
  };
  // L'adresse du garage porte déjà le complément et les infos d'accès (clientsDemonstration.ts).
  const fuite = planifier(
    fabriquerInterventionChez(...chez(jeu.clients, CLIENT_GARAGE_HOARAU), {
      id: 7,
      type: 'Recherche de fuite',
      dureeEstimeeMin: 90,
      urgence: 'URGENTE',
    }),
    jour,
    '14:00',
    4,
  );
  technicien.tournees.push({
    id: 11,
    dateTournee: jour,
    interventions: [signee, sansSignature, enCours, fuite],
  });
}

function terminee(intervention: Intervention, jour: string, compteRendu: string): Intervention {
  const debut = intervention.debutPrevu as string;
  return {
    ...intervention,
    statut: 'TERMINEE',
    demarreeLe: debut,
    termineeLe: intervention.finPrevue ?? versInstant(jour, '12:00'),
    compteRendu,
  };
}

/** Signature tracée à la volée dans un canvas : aucune image n'est versionnée. */
function dessinerSignatureDeDemonstration(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 200;
  const contexte = canvas.getContext('2d');
  if (!contexte) return '';
  contexte.strokeStyle = '#27313F';
  contexte.lineWidth = 3.5;
  contexte.lineCap = 'round';
  contexte.lineJoin = 'round';
  contexte.beginPath();
  contexte.moveTo(60, 130);
  contexte.bezierCurveTo(110, 20, 150, 180, 200, 100);
  contexte.bezierCurveTo(240, 40, 260, 160, 310, 110);
  contexte.bezierCurveTo(350, 70, 380, 150, 430, 95);
  contexte.quadraticCurveTo(480, 60, 540, 120);
  contexte.moveTo(90, 160);
  contexte.lineTo(500, 150);
  contexte.stroke();
  return canvas.toDataURL('image/png');
}
