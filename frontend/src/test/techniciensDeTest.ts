import { http, HttpResponse } from 'msw';
import type { FicheTechnicien, ListePaginee } from '../api/types';
import type { CompteUtilisateur } from '../api/utilisateurs.api';
import { fabriquerCompte, fabriquerTechnicien } from '../simulation/fabriques';
import { listePaginee } from './clientsDeTest';
import { serveurApi, urlApi } from './msw/serveur';

/*
 * Fiches techniciens et comptes utilisateurs de test (US11), aux noms accentués pour vérifier
 * qu'une recherche sans accent les retrouve. Chaque appel rend des objets neufs : un test peut les
 * modifier sans toucher les autres. Les fabriques sont celles du mode simulé
 * (simulation/fabriques.ts).
 */

export { fabriquerCompte, fabriquerTechnicien };

/** Karim Benali : fiche 2, rattachée au compte 7. */
export function karimDeTest(): FicheTechnicien {
  return fabriquerTechnicien({
    id: 2,
    utilisateurId: 7,
    nom: 'Benali',
    prenom: 'Karim',
    email: 'karim.benali@plumbly.re',
    telephone: '0692123456',
    couleurPlanning: '#1E88E5',
  });
}

/**
 * Trois techniciens en service, dans l'ordre alphabétique des noms, dont un au compte désactivé,
 * puis un technicien archivé. Les couleurs vont du jaune clair au brun foncé.
 */
export function techniciensDeTest(): FicheTechnicien[] {
  return [
    karimDeTest(),
    fabriquerTechnicien({
      id: 4,
      utilisateurId: 9,
      nom: 'Grondin',
      prenom: 'Loïc',
      email: 'loic.grondin@plumbly.re',
      telephone: '0692654321',
      couleurPlanning: '#FFEB3B',
    }),
    fabriquerTechnicien({
      id: 5,
      utilisateurId: 11,
      nom: 'Hoarau',
      prenom: 'Mickaël',
      email: 'mickael.hoarau@plumbly.re',
      compteActif: false,
      couleurPlanning: '#5D4037',
    }),
    fabriquerTechnicien({
      id: 6,
      utilisateurId: 12,
      nom: 'Payet',
      prenom: 'Sébastien',
      email: 'sebastien.payet@plumbly.re',
      couleurPlanning: '#AD1457',
      archive: true,
      archiveLe: '2026-11-20T06:00:00.000Z',
    }),
  ];
}

/**
 * Comptes de la base, dans l'ordre des noms : ceux des quatre fiches de techniciensDeTest (Payet a
 * une fiche archivée, Hoarau un compte désactivé), deux comptes techniciens sans fiche (Julie Roche
 * et Rémi Técher), un compte technicien désactivé sans fiche et une gestionnaire.
 */
export function comptesDeTest(): CompteUtilisateur[] {
  return [
    fabriquerCompte({ id: 7, nom: 'Benali', prenom: 'Karim', email: 'karim.benali@plumbly.re' }),
    fabriquerCompte({ id: 9, nom: 'Grondin', prenom: 'Loïc', email: 'loic.grondin@plumbly.re' }),
    fabriquerCompte({ id: 11, nom: 'Hoarau', prenom: 'Mickaël', actif: false }),
    fabriquerCompte({ id: 16, nom: 'Lebon', prenom: 'Fabrice', actif: false }),
    fabriquerCompte({ id: 3, nom: 'Martin', prenom: 'Sophie', role: 'GESTIONNAIRE' }),
    fabriquerCompte({ id: 12, nom: 'Payet', prenom: 'Sébastien' }),
    fabriquerCompte({ id: 14, nom: 'Roche', prenom: 'Julie', email: 'julie.roche@plumbly.re' }),
    fabriquerCompte({ id: 15, nom: 'Técher', prenom: 'Rémi', email: 'remi.techer@plumbly.re' }),
  ];
}

function sansAccent(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Page demandée d'une liste filtrée, avec les métadonnées que l'API calculerait. */
function paginer<T>(elements: T[], parametres: URLSearchParams): ListePaginee<T> {
  const page = Number(parametres.get('page') ?? 1);
  const limit = Number(parametres.get('limit') ?? 20);
  return listePaginee(elements.slice((page - 1) * limit, page * limit), {
    page,
    limit,
    total: elements.length,
    totalPages: Math.ceil(elements.length / limit),
  });
}

function correspond(technicien: FicheTechnicien, parametres: URLSearchParams): boolean {
  const recherche = parametres.get('recherche');
  if (parametres.get('archives') !== 'true' && technicien.archive) return false;
  const nomComplet = sansAccent(`${technicien.prenom} ${technicien.nom}`);
  return !recherche || nomComplet.includes(sansAccent(recherche));
}

function comparerParNom(premier: FicheTechnicien, second: FicheTechnicien): number {
  return (
    sansAccent(premier.nom).localeCompare(sansAccent(second.nom)) ||
    sansAccent(premier.prenom).localeCompare(sansAccent(second.prenom))
  );
}

/**
 * Simule GET /technicians sur ces fiches comme l'API : recherche sans accent sur le prénom et le
 * nom, archivés, tri par nom (« -nom » à rebours) et page. Garde les paramètres de chaque requête.
 */
export function servirLesTechniciens(techniciens: FicheTechnicien[]): URLSearchParams[] {
  const recues: URLSearchParams[] = [];
  serveurApi.use(
    http.get(urlApi('/technicians'), ({ request }) => {
      const parametres = new URL(request.url).searchParams;
      recues.push(parametres);
      const retenus = techniciens.filter((technicien) => correspond(technicien, parametres));
      retenus.sort(comparerParNom);
      if (parametres.get('tri') === '-nom') retenus.reverse();
      return HttpResponse.json(paginer(retenus, parametres));
    }),
  );
  return recues;
}

/**
 * Simule GET /users sur ces comptes, déjà dans l'ordre des noms : filtre sur le rôle et l'état
 * reçus, pagine, et garde les paramètres de chaque requête.
 */
export function servirLesComptes(comptes: CompteUtilisateur[]): URLSearchParams[] {
  const recues: URLSearchParams[] = [];
  serveurApi.use(
    http.get(urlApi('/users'), ({ request }) => {
      const parametres = new URL(request.url).searchParams;
      recues.push(parametres);
      const role = parametres.get('role');
      const actif = parametres.get('actif');
      const retenus = comptes.filter(
        (compte) => (!role || compte.role === role) && (!actif || String(compte.actif) === actif),
      );
      return HttpResponse.json(paginer(retenus, parametres));
    }),
  );
  return recues;
}
