import { BadRequestException } from '@nestjs/common';
import {
  lireBooleenDeRequete,
  lireCouleur,
  lireEntier,
  lireObjet,
  lirePagination,
  lireRecherche,
  lireTelephone,
  lireTri,
  signalerErreurs,
} from '../commun/validation.js';
import type {
  FiltresTechniciens,
  ModificationTechnicien,
  NouveauTechnicien,
} from './techniciens.types.js';
import { TRIS_TECHNICIENS } from './techniciens.types.js';

/* Validation des données reçues par les routes des techniciens (contrat d'API, section 6.6). */

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
