import type { Adresse, Client, FicheTechnicien } from '../api/types';
import type { CompteUtilisateur } from '../api/utilisateurs.api';

/*
 * Fabriques des objets de l'API (clients, adresses, fiches techniciens, comptes), partagées par
 * les données de démonstration du mode simulé et par les tests (src/test/). Chaque appel rend un
 * objet neuf : un test ou un handler peut le modifier sans toucher les autres.
 */

const CREATION = '2026-11-20T06:00:00.000Z';

export function fabriquerAdresse(surcharge: Partial<Adresse> & Pick<Adresse, 'id'>): Adresse {
  return {
    rue: `${surcharge.id} rue des Flamboyants`,
    complement: null,
    codePostal: '97400',
    ville: 'Saint-Denis',
    infosAcces: null,
    archive: false,
    archiveLe: null,
    ...surcharge,
  };
}

type DescriptionClient = Partial<Client> & Pick<Client, 'id' | 'nomAffiche'>;

export function fabriquerClient(surcharge: DescriptionClient): Client {
  return {
    typeClient: 'PARTICULIER',
    nomClient: null,
    prenomClient: null,
    raisonSociale: null,
    telephone: '0692000000',
    emailClient: null,
    archive: false,
    archiveLe: null,
    creeLe: CREATION,
    majLe: CREATION,
    adresses: [fabriquerAdresse({ id: surcharge.id * 10 })],
    ...surcharge,
  };
}

type DescriptionTechnicien = Partial<FicheTechnicien> &
  Pick<FicheTechnicien, 'id' | 'nom' | 'prenom'>;

export function fabriquerTechnicien(surcharge: DescriptionTechnicien): FicheTechnicien {
  return {
    utilisateurId: surcharge.id + 100,
    email: `technicien${surcharge.id}@plumbly.re`,
    compteActif: true,
    telephone: '0692000000',
    couleurPlanning: '#0F766E',
    archive: false,
    archiveLe: null,
    ...surcharge,
  };
}

type DescriptionCompte = Partial<CompteUtilisateur> &
  Pick<CompteUtilisateur, 'id' | 'nom' | 'prenom'>;

export function fabriquerCompte(surcharge: DescriptionCompte): CompteUtilisateur {
  return {
    email: `compte${surcharge.id}@plumbly.re`,
    role: 'TECHNICIEN',
    actif: true,
    mdpAChanger: false,
    derniereConnexion: null,
    creeLe: '2026-11-20T09:00:00.000Z',
    ...surcharge,
  };
}
