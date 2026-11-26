import type { Profil } from '../api/auth.api';
import type { CompteUtilisateur } from '../api/utilisateurs.api';
import { fabriquerCompte } from './fabriques';

/*
 * Comptes du mode simulé (npm run dev:simule) : un compte CONNECTABLE par rôle de l'application,
 * hors ADMIN dont les écrans ne sont pas simulés. Les e-mails figurent dans frontend/README.md.
 * Aucun mot de passe n'est défini : le faux serveur accepte n'importe quel mot de passe non vide
 * pour ces e-mails (voir handlersAuthentification.ts), il n'y a donc aucun secret à cacher ici.
 * Les autres comptes (comptesUtilisateursDeDemonstration) ne servent qu'aux fiches techniciens.
 */

/** Même personne que le créateur des interventions de démonstration (donneesDemonstration.ts). */
export const GESTIONNAIRE_DEMONSTRATION: Profil = {
  id: 1,
  email: 'gestion@plumbly.demo',
  nom: 'Payet',
  prenom: 'Sophie',
  role: 'GESTIONNAIRE',
  mdpAChanger: false,
};

/** Compte du premier technicien du planning simulé (jeu.techniciens[0], Jean Rivière). */
export const TECHNICIEN_DEMONSTRATION: Profil = {
  id: 4,
  email: 'technicien@plumbly.demo',
  nom: 'Rivière',
  prenom: 'Jean',
  role: 'TECHNICIEN',
  mdpAChanger: false,
};

/**
 * utilisateurId de la fiche technicien « connectée » du mode simulé : « Ma tournée du jour »
 * et les routes de terrain s'appuient sur ce technicien.
 */
export const UTILISATEUR_ID_TECHNICIEN_CONNECTE = TECHNICIEN_DEMONSTRATION.id;

export const COMPTES_DEMONSTRATION: readonly Profil[] = [
  GESTIONNAIRE_DEMONSTRATION,
  TECHNICIEN_DEMONSTRATION,
];

/** Comptes des autres fiches techniciens du planning simulé (jeu.techniciens[1..3]). */
export const UTILISATEUR_ID_MARIE_TECHER = 5;
export const UTILISATEUR_ID_PAUL_LEBON = 6;
export const UTILISATEUR_ID_SEBASTIEN_PAYET = 7;
/** Comptes TECHNICIEN actifs sans fiche : une création de fiche (US11) réussit avec eux. */
export const UTILISATEUR_ID_JULIE_ROCHE = 8;
export const UTILISATEUR_ID_REMI_DIJOUX = 9;
/** Compte TECHNICIEN désactivé, sans fiche : la création répond 400. */
export const UTILISATEUR_ID_FABRICE_LEBON = 10;

/** Date de création des comptes de démonstration (objet Utilisateur du contrat, 6.2). */
export const COMPTES_CREES_LE = '2026-01-05T04:00:00.000Z';

function versCompteUtilisateur(profil: Profil): CompteUtilisateur {
  return { ...profil, actif: true, derniereConnexion: null, creeLe: COMPTES_CREES_LE };
}

/**
 * Tous les comptes que GET /users simulé renvoie (ADMIN seulement), dans l'ordre des noms : les
 * deux comptes connectables, ceux des fiches techniciens (pour le 409 « déjà une fiche »), deux
 * comptes techniciens libres et un compte désactivé.
 */
export function comptesUtilisateursDeDemonstration(): CompteUtilisateur[] {
  const technicien = (id: number, nom: string, prenom: string, email: string, actif = true) =>
    fabriquerCompte({ id, nom, prenom, email, actif, creeLe: COMPTES_CREES_LE });
  return [
    technicien(UTILISATEUR_ID_REMI_DIJOUX, 'Dijoux', 'Rémi', 'remi.dijoux@plumbly.demo'),
    technicien(
      UTILISATEUR_ID_FABRICE_LEBON,
      'Lebon',
      'Fabrice',
      'fabrice.lebon@plumbly.demo',
      false,
    ),
    technicien(UTILISATEUR_ID_PAUL_LEBON, 'Lebon', 'Paul', 'paul.lebon@plumbly.demo'),
    technicien(
      UTILISATEUR_ID_SEBASTIEN_PAYET,
      'Payet',
      'Sébastien',
      'sebastien.payet@plumbly.demo',
    ),
    versCompteUtilisateur(GESTIONNAIRE_DEMONSTRATION),
    versCompteUtilisateur(TECHNICIEN_DEMONSTRATION),
    technicien(UTILISATEUR_ID_JULIE_ROCHE, 'Roche', 'Julie', 'julie.roche@plumbly.demo'),
    technicien(UTILISATEUR_ID_MARIE_TECHER, 'Técher', 'Marie', 'marie.techer@plumbly.demo'),
  ];
}
