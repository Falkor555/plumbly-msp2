import type { DateIso, Intervention } from '../api/types';
import { versInstant } from '../commun/dates';
import { UTILISATEUR_ID_TECHNICIEN_CONNECTE } from '../simulation/comptesDemonstration';
import {
  fabriquerIntervention,
  fabriquerTechnicienDeDemonstration,
  type JeuDeDemonstration,
  planifier,
} from '../simulation/donneesDemonstration';
import { IMAGE_PNG_DE_TEST } from './canvas';

/** Lundi 23 novembre 2026, jour de la tournée de test. */
export const JOUR_DE_TERRAIN = '2026-11-23';

/**
 * Tournée du jour de Jean Rivière (technicien 1, « connecté » en simulation) avec une étape de
 * chaque état : terminée et signée (id 1), terminée sans signature (2), en cours (3), planifiée (4).
 */
export function creerJeuDeTerrain(jour: DateIso = JOUR_DE_TERRAIN): JeuDeDemonstration {
  const etape = (id: number, client: string, type: string, heure: string): Intervention =>
    planifier(
      fabriquerIntervention({ id, client, type, ville: 'Saint-Denis', dureeEstimeeMin: 60 }),
      jour,
      heure,
      id,
    );
  const signee: Intervention = {
    ...etape(1, 'Mme Baret', 'Entretien chaudière', '07:30'),
    statut: 'TERMINEE',
    demarreeLe: versInstant(jour, '07:32'),
    termineeLe: versInstant(jour, '08:20'),
    compteRendu: 'Chaudière nettoyée.',
    signature: { nomSignataire: 'Josiane Baret', signeeLe: versInstant(jour, '08:20') },
  };
  const sansSignature: Intervention = {
    ...etape(2, 'M. Payet', 'Débouchage', '09:00'),
    statut: 'TERMINEE',
    demarreeLe: versInstant(jour, '09:05'),
    termineeLe: versInstant(jour, '09:50'),
    compteRendu: 'Évier débouché.',
  };
  const enCours: Intervention = {
    ...etape(3, 'Mme Grondin', 'Remplacement de robinet', '10:30'),
    statut: 'EN_COURS',
    demarreeLe: versInstant(jour, '10:35'),
  };
  const planifiee = etape(4, 'Garage Hoarau', 'Recherche de fuite', '14:00');
  return {
    techniciens: [
      fabriquerTechnicienDeDemonstration({
        id: 1,
        utilisateurId: UTILISATEUR_ID_TECHNICIEN_CONNECTE,
        nom: 'Rivière',
        prenom: 'Jean',
        telephone: '0692 11 11 11',
        couleurPlanning: '#0F766E',
        tournees: [
          { id: 10, dateTournee: jour, interventions: [signee, sansSignature, enCours, planifiee] },
        ],
      }),
    ],
    clients: [],
    comptes: [],
    interventionsAPlanifier: [],
    signatures: {
      1: {
        ...(signee.signature as NonNullable<Intervention['signature']>),
        auteur: { id: 1, nom: 'Rivière', prenom: 'Jean' },
        empreinte: '3f8a'.repeat(16),
        integre: true,
        image: IMAGE_PNG_DE_TEST,
      },
    },
  };
}
