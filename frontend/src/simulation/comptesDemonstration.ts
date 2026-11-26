import type { Profil } from '../api/auth.api';

/*
 * Comptes du mode simulé (npm run dev:simule) : un par rôle de l'application, hors ADMIN dont
 * les écrans ne sont pas simulés. Les e-mails figurent dans frontend/README.md. Aucun mot de passe
 * n'est défini : le faux serveur accepte n'importe quel mot de passe non vide pour ces e-mails
 * (voir handlersAuthentification.ts), il n'y a donc aucun secret à cacher ici.
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
