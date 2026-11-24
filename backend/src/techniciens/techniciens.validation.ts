import { BadRequestException } from '@nestjs/common';
import {
  estUneDate,
  lireBooleenDeRequete,
  lireCouleur,
  lireDateHeure,
  lireEntier,
  lireObjet,
  lirePagination,
  lireRecherche,
  lireTelephone,
  lireTexte,
  lireTri,
  signalerErreurs,
} from '../commun/validation.js';
import type {
  FiltresTechniciens,
  ModificationTechnicien,
  NouveauTechnicien,
  NouvelleIndisponibilite,
  PeriodeIndisponibilites,
} from './techniciens.types.js';
import { TRIS_TECHNICIENS } from './techniciens.types.js';

/* Validation des données reçues par les routes des techniciens (contrat d'API, section 6.6). */

const LONGUEUR_MOTIF = 255;

// Affichés sur la fiche mais portés par le compte utilisateur : un message dit où les modifier.
const CHAMPS_DU_COMPTE = ['nom', 'prenom', 'email', 'compteActif'];

/** POST /technicians */
export function lireNouveauTechnicien(corps: unknown): NouveauTechnicien {
  const champs = lireObjet(corps, ['utilisateurId', 'telephone', 'couleurPlanning']);
  const erreurs: string[] = [];
  const utilisateurId = lireEntier(champs, 'utilisateurId', erreurs, { obligatoire: true });
  const telephone = lireTelephone(champs, 'telephone', erreurs, { obligatoire: true });
  const couleurPlanning = lireCouleur(champs, 'couleurPlanning', erreurs, { obligatoire: false });
  signalerErreurs(erreurs);
  const nouveau: NouveauTechnicien = {
    utilisateurId: utilisateurId as number,
    telephone: telephone as string,
  };
  if (couleurPlanning !== undefined) {
    nouveau.couleurPlanning = couleurPlanning;
  }
  return nouveau;
}

/** PATCH /technicians/:id : seuls le téléphone et la couleur se modifient ici. */
export function lireModificationTechnicien(corps: unknown): ModificationTechnicien {
  refuserLesChampsDuCompte(corps);
  const champs = lireObjet(corps, ['telephone', 'couleurPlanning']);
  const erreurs: string[] = [];
  const telephone = lireTelephone(champs, 'telephone', erreurs, { obligatoire: false });
  const couleurPlanning = lireCouleur(champs, 'couleurPlanning', erreurs, { obligatoire: false });
  signalerErreurs(erreurs);
  const modification: ModificationTechnicien = {};
  if (telephone !== undefined) {
    modification.telephone = telephone;
  }
  if (couleurPlanning !== undefined) {
    modification.couleurPlanning = couleurPlanning;
  }
  return modification;
}

/** GET /technicians : techniciens en service triés par nom, par défaut. */
export function lireFiltresTechniciens(requete: Record<string, unknown>): FiltresTechniciens {
  const champs = lireObjet(requete, ['page', 'limit', 'recherche', 'archives', 'tri']);
  const erreurs: string[] = [];
  const filtres: FiltresTechniciens = {
    ...lirePagination(champs, erreurs),
    archives: lireBooleenDeRequete(champs, 'archives', erreurs),
    tri: lireTri(champs, TRIS_TECHNICIENS, 'nom', erreurs),
  };
  const recherche = lireRecherche(champs, erreurs);
  signalerErreurs(erreurs);
  if (recherche !== undefined) {
    filtres.recherche = recherche;
  }
  return filtres;
}

/** POST /technicians/:id/unavailabilities : la fin suit strictement le début. */
export function lireNouvelleIndisponibilite(corps: unknown): NouvelleIndisponibilite {
  const champs = lireObjet(corps, ['debut', 'fin', 'motif']);
  const erreurs: string[] = [];
  const debut = lireDateHeure(champs, 'debut', erreurs);
  const fin = lireDateHeure(champs, 'fin', erreurs);
  const motif = lireTexte(champs, 'motif', erreurs, {
    obligatoire: false,
    maximum: LONGUEUR_MOTIF,
    effacable: true,
  });
  if (debut !== undefined && fin !== undefined && fin <= debut) {
    erreurs.push('fin doit être postérieure à debut');
  }
  signalerErreurs(erreurs);
  return { debut: debut as Date, fin: fin as Date, motif: motif ?? null };
}

/** GET /technicians/:id/unavailabilities : du et au facultatifs, chacun utilisable seul. */
export function lirePeriodeIndisponibilites(
  requete: Record<string, unknown>,
): PeriodeIndisponibilites {
  const champs = lireObjet(requete, ['du', 'au']);
  const erreurs: string[] = [];
  const periode: PeriodeIndisponibilites = {};
  for (const nom of ['du', 'au'] as const) {
    const valeur = champs[nom];
    if (valeur === undefined) {
      continue;
    }
    if (typeof valeur !== 'string' || !estUneDate(valeur)) {
      erreurs.push(`${nom} doit être une date AAAA-MM-JJ`);
    } else {
      periode[nom] = valeur;
    }
  }
  // Le format AAAA-MM-JJ se compare correctement dans l'ordre alphabétique.
  if (periode.du !== undefined && periode.au !== undefined && periode.du > periode.au) {
    erreurs.push('du doit précéder au');
  }
  signalerErreurs(erreurs);
  return periode;
}

function refuserLesChampsDuCompte(corps: unknown): void {
  if (typeof corps !== 'object' || corps === null) {
    return;
  }
  const duCompte = Object.keys(corps).filter((cle) => CHAMPS_DU_COMPTE.includes(cle));
  if (duCompte.length > 0) {
    throw new BadRequestException(
      duCompte.map(
        (cle) => `${cle} vient du compte utilisateur : il se modifie par PATCH /users/:id`,
      ),
    );
  }
}
