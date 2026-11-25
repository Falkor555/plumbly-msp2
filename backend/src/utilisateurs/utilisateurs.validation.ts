import { BadRequestException } from '@nestjs/common';
import { lireMotDePasseSaisi } from '../authentification/authentification.validation.js';
import { erreursDePolitique } from '../authentification/mots-de-passe.js';
import {
  type Champs,
  lireEmail,
  lireEnumeration,
  lireObjet,
  lirePagination,
  lireRecherche,
  lireTexte,
  lireTri,
  signalerErreurs,
} from '../commun/validation.js';
import { Role } from '../generated/prisma/client.ts';
import {
  type ChangementMotDePasse,
  type FiltresUtilisateurs,
  type ModificationProfil,
  type ModificationUtilisateur,
  type NouvelUtilisateur,
  TRIS_UTILISATEURS,
} from './utilisateurs.types.js';

const LONGUEUR_NOM_MAXIMUM = 100;
const NOM_FACULTATIF = { obligatoire: false, maximum: LONGUEUR_NOM_MAXIMUM };
const NOM_OBLIGATOIRE = { obligatoire: true, maximum: LONGUEUR_NOM_MAXIMUM };
const ROLES = Object.values(Role);

/** Corps de PATCH /users/me : un champ email ou role est refusé (400). */
export function lireModificationProfil(corps: unknown): ModificationProfil {
  const champs = lireObjet(corps, ['nom', 'prenom']);
  const erreurs: string[] = [];
  const nom = lireTexte(champs, 'nom', erreurs, NOM_FACULTATIF);
  const prenom = lireTexte(champs, 'prenom', erreurs, NOM_FACULTATIF);
  signalerErreurs(erreurs);
  const modification: ModificationProfil = {};
  if (typeof nom === 'string') {
    modification.nom = nom;
  }
  if (typeof prenom === 'string') {
    modification.prenom = prenom;
  }
  if (Object.keys(modification).length === 0) {
    throw new BadRequestException(['Aucun champ à modifier : préciser nom ou prenom']);
  }
  return modification;
}

/** Corps de PATCH /users/me/password : le nouveau mot de passe respecte la politique. */
export function lireChangementMotDePasse(corps: unknown): ChangementMotDePasse {
  const champs = lireObjet(corps, ['ancienMotDePasse', 'nouveauMotDePasse']);
  const erreurs: string[] = [];
  const ancien = lireMotDePasseSaisi(champs.ancienMotDePasse, 'ancienMotDePasse', erreurs);
  const nouveau = lireMotDePasseSaisi(champs.nouveauMotDePasse, 'nouveauMotDePasse', erreurs);
  if (nouveau !== undefined) {
    erreurs.push(...erreursDePolitique(nouveau, 'nouveauMotDePasse'));
    if (nouveau === ancien) {
      erreurs.push('nouveauMotDePasse doit être différent de l’ancien');
    }
  }
  signalerErreurs(erreurs);
  return { ancienMotDePasse: ancien as string, nouveauMotDePasse: nouveau as string };
}

/** Paramètres de GET /users (US03). */
export function lireFiltresUtilisateurs(requete: Record<string, unknown>): FiltresUtilisateurs {
  const champs = lireObjet(requete, ['page', 'limit', 'recherche', 'role', 'actif', 'tri']);
  const erreurs: string[] = [];
  const filtres: FiltresUtilisateurs = {
    ...lirePagination(champs, erreurs),
    tri: lireTri(champs, TRIS_UTILISATEURS, 'nom', erreurs),
  };
  const recherche = lireRecherche(champs, erreurs);
  const role = lireEnumeration(champs, 'role', ROLES, erreurs, { obligatoire: false });
  const actif = lireActif(champs, erreurs);
  signalerErreurs(erreurs);
  if (recherche !== undefined) {
    filtres.recherche = recherche;
  }
  if (role !== undefined) {
    filtres.role = role;
  }
  if (actif !== undefined) {
    filtres.actif = actif;
  }
  return filtres;
}

/** Filtre facultatif : sans paramètre, les comptes actifs et désactivés sont listés. */
function lireActif(champs: Champs, erreurs: string[]): boolean | undefined {
  const valeur = champs.actif;
  if (valeur === undefined) {
    return undefined;
  }
  if (valeur === 'true' || valeur === 'false') {
    return valeur === 'true';
  }
  erreurs.push('actif doit valoir true ou false');
  return undefined;
}

/** Corps de POST /users (US03). L'e-mail est enregistré en minuscules. */
export function lireNouvelUtilisateur(corps: unknown): NouvelUtilisateur {
  const champs = lireObjet(corps, ['email', 'nom', 'prenom', 'role']);
  const erreurs: string[] = [];
  const email = lireEmail(champs, 'email', erreurs, { obligatoire: true });
  const nom = lireTexte(champs, 'nom', erreurs, NOM_OBLIGATOIRE);
  const prenom = lireTexte(champs, 'prenom', erreurs, NOM_OBLIGATOIRE);
  const role = lireEnumeration(champs, 'role', ROLES, erreurs, { obligatoire: true });
  signalerErreurs(erreurs);
  return {
    email: (email as string).toLowerCase(),
    nom: nom as string,
    prenom: prenom as string,
    role: role as Role,
  };
}

/** Corps de PATCH /users/:id (US03) : au moins un champ. */
export function lireModificationUtilisateur(corps: unknown): ModificationUtilisateur {
  const champs = lireObjet(corps, ['email', 'nom', 'prenom', 'role']);
  const erreurs: string[] = [];
  const email = lireEmail(champs, 'email', erreurs, { obligatoire: false });
  const nom = lireTexte(champs, 'nom', erreurs, NOM_FACULTATIF);
  const prenom = lireTexte(champs, 'prenom', erreurs, NOM_FACULTATIF);
  const role = lireEnumeration(champs, 'role', ROLES, erreurs, { obligatoire: false });
  signalerErreurs(erreurs);
  const modification: ModificationUtilisateur = {};
  if (typeof email === 'string') {
    modification.email = email.toLowerCase();
  }
  if (typeof nom === 'string') {
    modification.nom = nom;
  }
  if (typeof prenom === 'string') {
    modification.prenom = prenom;
  }
  if (role !== undefined) {
    modification.role = role;
  }
  if (Object.keys(modification).length === 0) {
    throw new BadRequestException(['Aucun champ à modifier : préciser email, nom, prenom ou role']);
  }
  return modification;
}
