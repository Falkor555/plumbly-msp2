import { http, type HttpHandler, HttpResponse } from 'msw';
import type { Role } from '../api/auth.api';
import type {
  DateIso,
  FicheTechnicien,
  Indisponibilite,
  Intervention,
  ListePaginee,
  ModificationTechnicien,
  NouveauTechnicien,
  TriTechniciens,
} from '../api/types';
import type { CompteUtilisateur } from '../api/utilisateurs.api';
import { ajouterJours, dateMetier, heureMetier, jourMetier, versInstant } from '../commun/dates';
import type { JeuDeDemonstration, TechnicienDeDemonstration } from './donneesDemonstration';
import { compteAuthentifie } from './handlersAuthentification';
import {
  type Champs,
  comparerSansAccent,
  compteurApres,
  contientSansAccent,
  estUneDate,
  lireBooleenDeRequete,
  lireCorps,
  lireCouleur,
  lireDateHeure,
  lireEntier,
  lireEnumeration,
  lireIdentifiant,
  lireObjet,
  type Pagination,
  lirePagination,
  lireParametres,
  lireRecherche,
  lireTelephone,
  lireTexte,
  lireTri,
  paginer,
  refuser,
  repondre,
  sansChampsAbsents,
  signalerErreurs,
} from './validationSimulee';

/*
 * Simulation en mémoire des routes des techniciens (docs/api.md, 6.6 ; back :
 * backend/src/techniciens/) et de GET /users (6.2, ADMIN seulement), pour l'écran de création
 * d'une fiche (US11) et les indisponibilités (US12). Les contrôles et leurs messages sont ceux du
 * back, dans le même ordre. Les fiches sont les techniciens du planning : une fiche créée ou
 * archivée se voit aussitôt sur GET /tours.
 */

/** Couleurs que l'API attribue quand la création n'en précise pas (regles-techniciens.ts). */
export const PALETTE_PLANNING = [
  '#0F766E',
  '#1E88E5',
  '#AF4C00',
  '#7B1FA2',
  '#2E7D32',
  '#C62828',
  '#00838F',
  '#5D4037',
  '#AD1457',
  '#455A64',
] as const;

const TRIS_TECHNICIENS: readonly TriTechniciens[] = ['nom', '-nom'];
const ROLES: readonly Role[] = ['ADMIN', 'GESTIONNAIRE', 'TECHNICIEN'];
// Affichés sur la fiche mais portés par le compte utilisateur : un message dit où les modifier.
const CHAMPS_DU_COMPTE = ['nom', 'prenom', 'email', 'compteActif'];
const LONGUEUR_MOTIF = 255;
const TECHNICIEN_INTROUVABLE = 'Technicien introuvable.';

interface Options {
  urlApi: (chemin: string) => string;
  maintenant?: () => Date;
}

/** Ce que partagent les règles : le jeu, l'heure courante et les séquences d'identifiants. */
interface Contexte {
  jeu: JeuDeDemonstration;
  maintenant: () => Date;
  prochainIdTechnicien: () => number;
  prochainIdIndisponibilite: () => number;
}

interface Periode {
  debut: string;
  fin: string;
}

type NouvelleIndisponibilite = Periode & { motif: string | null };

/** Jours demandés à GET /technicians/:id/unavailabilities, chacun facultatif. */
interface PeriodeDemandee {
  du?: DateIso;
  au?: DateIso;
}

interface FiltresTechniciens {
  pagination: Pagination;
  archives: boolean;
  tri: TriTechniciens;
  recherche?: string;
}

interface FiltresUtilisateurs {
  pagination: Pagination;
  tri: TriTechniciens;
  recherche?: string;
  role?: Role;
  actif?: boolean;
}

// ---------- Lecture des entrées, comme techniciens.validation.ts ----------

function lireNouveauTechnicien(corps: unknown): NouveauTechnicien {
  const champs = lireObjet(corps, ['utilisateurId', 'telephone', 'couleurPlanning']);
  const erreurs: string[] = [];
  const utilisateurId = lireEntier(champs, 'utilisateurId', erreurs, { obligatoire: true });
  const telephone = lireTelephone(champs, 'telephone', erreurs, { obligatoire: true });
  const couleurPlanning = lireCouleur(champs, 'couleurPlanning', erreurs, { obligatoire: false });
  signalerErreurs(erreurs);
  return {
    utilisateurId: utilisateurId as number,
    telephone: telephone as string,
    couleurPlanning,
  };
}

function refuserLesChampsDuCompte(corps: unknown): void {
  if (typeof corps !== 'object' || corps === null) return;
  const duCompte = Object.keys(corps).filter((cle) => CHAMPS_DU_COMPTE.includes(cle));
  if (duCompte.length > 0) {
    throw refuser(
      duCompte.map(
        (cle) => `${cle} vient du compte utilisateur : il se modifie par PATCH /users/:id`,
      ),
    );
  }
}

function lireModificationTechnicien(corps: unknown): ModificationTechnicien {
  refuserLesChampsDuCompte(corps);
  const champs = lireObjet(corps, ['telephone', 'couleurPlanning']);
  const erreurs: string[] = [];
  const modification = sansChampsAbsents({
    telephone: lireTelephone(champs, 'telephone', erreurs, { obligatoire: false }),
    couleurPlanning: lireCouleur(champs, 'couleurPlanning', erreurs, { obligatoire: false }),
  });
  signalerErreurs(erreurs);
  return modification;
}

function lireFiltresTechniciens(request: Request): FiltresTechniciens {
  const champs = lireParametres(request, ['page', 'limit', 'recherche', 'archives', 'tri']);
  const erreurs: string[] = [];
  const pagination = lirePagination(champs, erreurs);
  const archives = lireBooleenDeRequete(champs, 'archives', erreurs);
  const tri = lireTri(champs, TRIS_TECHNICIENS, 'nom', erreurs);
  const recherche = lireRecherche(champs, erreurs);
  signalerErreurs(erreurs);
  return { pagination, archives, tri, recherche };
}

function lireNouvelleIndisponibilite(corps: unknown): NouvelleIndisponibilite {
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
  return { debut: debut as string, fin: fin as string, motif: motif ?? null };
}

/** du et au facultatifs, chacun utilisable seul ; des jours réels du calendrier. */
function lirePeriodeIndisponibilites(request: Request): PeriodeDemandee {
  const champs = lireParametres(request, ['du', 'au']);
  const erreurs: string[] = [];
  const periode: PeriodeDemandee = {};
  for (const nom of ['du', 'au'] as const) {
    const valeur = champs[nom];
    if (valeur === undefined) continue;
    if (typeof valeur !== 'string' || !estUneDate(valeur)) {
      erreurs.push(`${nom} doit être une date AAAA-MM-JJ`);
    } else {
      periode[nom] = valeur;
    }
  }
  if (periode.du !== undefined && periode.au !== undefined && periode.du > periode.au) {
    erreurs.push('du doit précéder au');
  }
  signalerErreurs(erreurs);
  return periode;
}

function lireFiltresUtilisateurs(request: Request): FiltresUtilisateurs {
  const champs = lireParametres(request, ['page', 'limit', 'recherche', 'role', 'actif', 'tri']);
  const erreurs: string[] = [];
  const pagination = lirePagination(champs, erreurs);
  const tri = lireTri(champs, TRIS_TECHNICIENS, 'nom', erreurs);
  const recherche = lireRecherche(champs, erreurs);
  const role = lireEnumeration(champs, 'role', ROLES, erreurs, { obligatoire: false });
  const actif = lireActif(champs, erreurs);
  signalerErreurs(erreurs);
  return { pagination, tri, recherche, role, actif };
}

function lireActif(champs: Champs, erreurs: string[]): boolean | undefined {
  const valeur = champs.actif;
  if (valeur === undefined) return undefined;
  if (valeur === 'true' || valeur === 'false') return valeur === 'true';
  erreurs.push('actif doit valoir true ou false');
  return undefined;
}

// ---------- Règles, comme regles-techniciens.ts ----------

/** « 08/12/2026 de 08:00 à 09:00 », à l'heure de La Réunion. */
function decrire({ debut, fin }: Periode): string {
  return `${dateMetier(debut)} de ${heureMetier(debut)} à ${heureMetier(fin)}`;
}

/** « 08/12/2026 08:00 au 10/12/2026 18:00 », à l'heure de La Réunion. */
function decrireDebutEtFin({ debut, fin }: Periode): string {
  return `${dateMetier(debut)} ${heureMetier(debut)} au ${dateMetier(fin)} ${heureMetier(fin)}`;
}

function verifierAucuneInterventionRecouverte(interventions: Intervention[]): void {
  if (interventions.length === 0) return;
  const citees = interventions
    .map(
      ({ id, debutPrevu, finPrevue }) =>
        // Filtrées sur debutPrevu et finPrevue : les deux sont renseignées.
        `n° ${id} le ${decrire({ debut: debutPrevu as string, fin: finPrevue as string })}`,
    )
    .join(', ');
  const plusieurs = interventions.length > 1;
  const recouvertes = plusieurs
    ? 'des interventions planifiées ou en cours'
    : 'une intervention planifiée ou en cours';
  const consigne = plusieurs
    ? 'Retirez-les de sa tournée ou déplacez-les d’abord.'
    : 'Retirez-la de sa tournée ou déplacez-la d’abord.';
  throw refuser(`La période recouvre ${recouvertes} du technicien : ${citees}. ${consigne}`, 409);
}

function verifierAucuneIndisponibiliteRecouverte(indisponibilites: Periode[]): void {
  if (indisponibilites.length === 0) return;
  const citees = indisponibilites.map((periode) => `du ${decrireDebutEtFin(periode)}`).join(', ');
  throw refuser(`La période recouvre une autre indisponibilité du technicien : ${citees}.`, 409);
}

function seRecouvrent(a: Periode, b: Periode): boolean {
  return a.debut < b.fin && a.fin > b.debut;
}

/** Première couleur libre de la palette ; sinon la moins utilisée (la première si égalité). */
export function choisirCouleur(couleursUtilisees: string[]): string {
  const utilisations = new Map<string, number>(PALETTE_PLANNING.map((couleur) => [couleur, 0]));
  for (const couleur of couleursUtilisees) {
    const nombre = utilisations.get(couleur.toUpperCase());
    if (nombre !== undefined) utilisations.set(couleur.toUpperCase(), nombre + 1);
  }
  let choisie: string = PALETTE_PLANNING[0];
  for (const couleur of PALETTE_PLANNING) {
    if ((utilisations.get(couleur) ?? 0) < (utilisations.get(choisie) ?? 0)) choisie = couleur;
  }
  return choisie;
}

// ---------- Recherche, tri et présentation ----------

/** Seule la fiche sort : ni tournées ni indisponibilités (techniciens.presentation.ts). */
function versFiche(technicien: TechnicienDeDemonstration): FicheTechnicien {
  const { id, utilisateurId, nom, prenom, email, compteActif, telephone, couleurPlanning } =
    technicien;
  return {
    id,
    utilisateurId,
    nom,
    prenom,
    email,
    compteActif,
    telephone,
    couleurPlanning,
    archive: technicien.archive,
    archiveLe: technicien.archiveLe,
  };
}

/** Recherche du back : nom, prénom ou « prénom nom », sans accents. */
function correspondAuNom(personne: { nom: string; prenom: string }, recherche: string): boolean {
  return (
    contientSansAccent(personne.nom, recherche) ||
    contientSansAccent(personne.prenom, recherche) ||
    contientSansAccent(`${personne.prenom} ${personne.nom}`, recherche)
  );
}

/** Tri du back : nom, prénom puis identifiant, inversé pour « -nom ». */
function comparerParNom<T extends { id: number; nom: string; prenom: string }>(
  tri: TriTechniciens,
): (premier: T, second: T) => number {
  return (premier, second) => {
    const ordre =
      comparerSansAccent(premier.nom, second.nom) ||
      comparerSansAccent(premier.prenom, second.prenom) ||
      premier.id - second.id;
    return tri === '-nom' ? -ordre : ordre;
  };
}

function listerFiches(jeu: JeuDeDemonstration, filtres: FiltresTechniciens): FicheTechnicien[] {
  const { archives, recherche, tri } = filtres;
  return jeu.techniciens
    .filter((technicien) => archives || !technicien.archive)
    .filter((technicien) => recherche === undefined || correspondAuNom(technicien, recherche))
    .sort(comparerParNom<TechnicienDeDemonstration>(tri))
    .map(versFiche);
}

// ---------- Fiches ----------

function trouverTechnicien(jeu: JeuDeDemonstration, id: number): TechnicienDeDemonstration {
  const technicien = jeu.techniciens.find((candidat) => candidat.id === id);
  if (!technicien) throw refuser(TECHNICIEN_INTROUVABLE, 404);
  return technicien;
}

/** Le compte existe, est actif, a le rôle TECHNICIEN et n'a encore aucune fiche, même archivée. */
function verifierCompteLibre(jeu: JeuDeDemonstration, utilisateurId: number): CompteUtilisateur {
  const compte = jeu.comptes.find(({ id }) => id === utilisateurId);
  if (!compte) throw refuser('Le compte utilisateur indiqué n’existe pas.');
  if (!compte.actif) {
    throw refuser(
      'Ce compte utilisateur est désactivé : réactivez-le avant de créer sa fiche technicien.',
    );
  }
  if (compte.role !== 'TECHNICIEN') {
    throw refuser(
      `Ce compte a le rôle ${compte.role} : ` +
        'seul un compte TECHNICIEN peut avoir une fiche technicien.',
    );
  }
  if (jeu.techniciens.some((technicien) => technicien.utilisateurId === compte.id)) {
    throw refuser('Ce compte a déjà une fiche technicien.', 409);
  }
  return compte;
}

function creerTechnicien(contexte: Contexte, corps: unknown): TechnicienDeDemonstration {
  const nouveau = lireNouveauTechnicien(corps);
  const compte = verifierCompteLibre(contexte.jeu, nouveau.utilisateurId);
  const couleursEnService = contexte.jeu.techniciens
    .filter(({ archive }) => !archive)
    .map(({ couleurPlanning }) => couleurPlanning);
  return {
    id: contexte.prochainIdTechnicien(),
    utilisateurId: compte.id,
    nom: compte.nom,
    prenom: compte.prenom,
    email: compte.email,
    compteActif: compte.actif,
    telephone: nouveau.telephone,
    couleurPlanning: nouveau.couleurPlanning ?? choisirCouleur(couleursEnService),
    archive: false,
    archiveLe: null,
    indisponibilites: [],
    tournees: [],
  };
}

function modifierTechnicien(
  technicien: TechnicienDeDemonstration,
  modification: ModificationTechnicien,
): void {
  if (technicien.archive) {
    throw refuser('Ce technicien est archivé : sa fiche ne peut plus être modifiée.');
  }
  Object.assign(technicien, modification);
}

/** Interventions en cours, ou planifiées dans une tournée d'aujourd'hui ou d'un jour suivant. */
function compterInterventionsAVenir(
  technicien: TechnicienDeDemonstration,
  aujourdhui: DateIso,
): number {
  return technicien.tournees.flatMap((tournee) =>
    tournee.interventions.filter(
      ({ statut }) =>
        statut === 'EN_COURS' || (statut === 'PLANIFIEE' && tournee.dateTournee >= aujourdhui),
    ),
  ).length;
}

function archiverTechnicien(technicien: TechnicienDeDemonstration, maintenant: Date): void {
  if (technicien.archive) throw refuser('Ce technicien est déjà archivé.');
  const aVenir = compterInterventionsAVenir(technicien, jourMetier(maintenant));
  if (aVenir > 0) {
    throw refuser(
      'Impossible d’archiver ce technicien tant qu’il a des interventions en cours ou ' +
        `planifiées à partir d’aujourd’hui (${aVenir} actuellement) : ` +
        'retirez-les de ses tournées d’abord.',
      409,
    );
  }
  Object.assign(technicien, { archive: true, archiveLe: maintenant.toISOString() });
}

// ---------- Indisponibilités ----------

/** finApres du service du back : minuit le jour « du » ; sans aucune borne, maintenant. */
function finApres({ du, au }: PeriodeDemandee, maintenant: Date): string | undefined {
  if (du !== undefined) return versInstant(du, '00:00');
  return au === undefined ? maintenant.toISOString() : undefined;
}

/** « au » inclut toute sa journée à La Réunion : jusqu'à minuit le lendemain, exclu. */
function debutAvant({ au }: PeriodeDemandee): string | undefined {
  return au === undefined ? undefined : versInstant(ajouterJours(au, 1), '00:00');
}

function indisponibilitesDans(
  technicien: TechnicienDeDemonstration,
  periode: PeriodeDemandee,
  maintenant: Date,
): Indisponibilite[] {
  const borneDeFin = finApres(periode, maintenant);
  const borneDeDebut = debutAvant(periode);
  return technicien.indisponibilites
    .filter(
      ({ debut, fin }) =>
        (borneDeFin === undefined || fin > borneDeFin) &&
        (borneDeDebut === undefined || debut < borneDeDebut),
    )
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.id - b.id);
}

/** RG10 : interventions planifiées ou en cours que la période recouvre, dans l'ordre des débuts. */
function interventionsRecouvertes(
  technicien: TechnicienDeDemonstration,
  periode: Periode,
): Intervention[] {
  return technicien.tournees
    .flatMap(({ interventions }) => interventions)
    .filter(
      ({ statut, debutPrevu, finPrevue }) =>
        (statut === 'PLANIFIEE' || statut === 'EN_COURS') &&
        debutPrevu !== null &&
        finPrevue !== null &&
        seRecouvrent({ debut: debutPrevu, fin: finPrevue }, periode),
    )
    .sort((a, b) => (a.debutPrevu as string).localeCompare(b.debutPrevu as string));
}

function ajouterIndisponibilite(
  contexte: Contexte,
  technicien: TechnicienDeDemonstration,
  nouvelle: NouvelleIndisponibilite,
): Indisponibilite {
  if (technicien.archive) {
    throw refuser('Ce technicien est archivé : on ne peut plus lui ajouter d’indisponibilité.');
  }
  verifierAucuneInterventionRecouverte(interventionsRecouvertes(technicien, nouvelle));
  verifierAucuneIndisponibiliteRecouverte(
    technicien.indisponibilites
      .filter((existante) => seRecouvrent(existante, nouvelle))
      .sort((a, b) => a.debut.localeCompare(b.debut)),
  );
  const indisponibilite: Indisponibilite = {
    id: contexte.prochainIdIndisponibilite(),
    ...nouvelle,
  };
  technicien.indisponibilites.push(indisponibilite);
  return indisponibilite;
}

function supprimerIndisponibilite(
  technicien: TechnicienDeDemonstration,
  id: number,
  maintenant: Date,
): void {
  const rang = technicien.indisponibilites.findIndex((candidate) => candidate.id === id);
  if (rang === -1) throw refuser('Indisponibilité introuvable pour ce technicien.', 404);
  if (technicien.indisponibilites[rang].fin <= maintenant.toISOString()) {
    throw refuser('Cette indisponibilité est terminée : elle est conservée dans l’historique.');
  }
  technicien.indisponibilites.splice(rang, 1);
}

// ---------- Comptes utilisateurs (GET /users) ----------

/** Gardes du back pour GET /users : jeton et session valides (401), puis rôle ADMIN (403). */
function verifierAdministrateur(request: Request): void {
  const compte = compteAuthentifie(request);
  if (compte === null) throw refuser('Authentification requise.', 401);
  if (compte.role !== 'ADMIN') throw refuser('Accès refusé.', 403);
}

/** Recherche du back sur les comptes : le nom comme pour une fiche, ou l'e-mail. */
function compteRetenu(compte: CompteUtilisateur, filtres: FiltresUtilisateurs): boolean {
  const { role, actif, recherche } = filtres;
  if (role !== undefined && compte.role !== role) return false;
  if (actif !== undefined && compte.actif !== actif) return false;
  return (
    recherche === undefined ||
    correspondAuNom(compte, recherche) ||
    compte.email.toLowerCase().includes(recherche.toLowerCase())
  );
}

function listerComptes(jeu: JeuDeDemonstration, request: Request): ListePaginee<CompteUtilisateur> {
  verifierAdministrateur(request);
  const filtres = lireFiltresUtilisateurs(request);
  const retenus = jeu.comptes
    .filter((compte) => compteRetenu(compte, filtres))
    .sort(comparerParNom<CompteUtilisateur>(filtres.tri));
  return paginer(retenus, filtres.pagination);
}

// ---------- Routes ----------

function routesDesFiches(contexte: Contexte, urlApi: Options['urlApi']): HttpHandler[] {
  const { jeu, maintenant } = contexte;
  return [
    http.get(urlApi('/technicians'), ({ request }) =>
      repondre(() => {
        const filtres = lireFiltresTechniciens(request);
        return HttpResponse.json(paginer(listerFiches(jeu, filtres), filtres.pagination));
      }),
    ),
    http.post(urlApi('/technicians'), ({ request }) =>
      repondre(async () => {
        const technicien = creerTechnicien(contexte, await lireCorps(request));
        jeu.techniciens.push(technicien);
        return HttpResponse.json(versFiche(technicien), { status: 201 });
      }),
    ),
    http.get(urlApi('/technicians/:id'), ({ params }) =>
      repondre(() =>
        HttpResponse.json(versFiche(trouverTechnicien(jeu, lireIdentifiant(params.id)))),
      ),
    ),
    http.patch(urlApi('/technicians/:id'), ({ params, request }) =>
      repondre(async () => {
        const id = lireIdentifiant(params.id);
        const modification = lireModificationTechnicien(await lireCorps(request));
        const technicien = trouverTechnicien(jeu, id);
        modifierTechnicien(technicien, modification);
        return HttpResponse.json(versFiche(technicien));
      }),
    ),
    http.post(urlApi('/technicians/:id/archive'), ({ params }) =>
      repondre(() => {
        const technicien = trouverTechnicien(jeu, lireIdentifiant(params.id));
        archiverTechnicien(technicien, maintenant());
        return HttpResponse.json(versFiche(technicien));
      }),
    ),
  ];
}

function routesDesIndisponibilites(contexte: Contexte, urlApi: Options['urlApi']): HttpHandler[] {
  const { jeu, maintenant } = contexte;
  return [
    http.get(urlApi('/technicians/:id/unavailabilities'), ({ params, request }) =>
      repondre(() => {
        const id = lireIdentifiant(params.id);
        const periode = lirePeriodeIndisponibilites(request);
        const technicien = trouverTechnicien(jeu, id);
        return HttpResponse.json(indisponibilitesDans(technicien, periode, maintenant()));
      }),
    ),
    http.post(urlApi('/technicians/:id/unavailabilities'), ({ params, request }) =>
      repondre(async () => {
        const id = lireIdentifiant(params.id);
        // Comme le back : le corps est validé (400) avant de chercher le technicien (404).
        const nouvelle = lireNouvelleIndisponibilite(await lireCorps(request));
        const technicien = trouverTechnicien(jeu, id);
        const indisponibilite = ajouterIndisponibilite(contexte, technicien, nouvelle);
        return HttpResponse.json(indisponibilite, { status: 201 });
      }),
    ),
    http.delete(urlApi('/technicians/:id/unavailabilities/:iid'), ({ params }) =>
      repondre(() => {
        const id = lireIdentifiant(params.id);
        const idIndisponibilite = lireIdentifiant(params.iid);
        supprimerIndisponibilite(trouverTechnicien(jeu, id), idIndisponibilite, maintenant());
        return new HttpResponse(null, { status: 204 });
      }),
    ),
  ];
}

export function creerHandlersTechniciens(
  jeu: JeuDeDemonstration,
  { urlApi, maintenant = () => new Date() }: Options,
): HttpHandler[] {
  const contexte: Contexte = {
    jeu,
    maintenant,
    prochainIdTechnicien: compteurApres(jeu.techniciens.map(({ id }) => id)),
    prochainIdIndisponibilite: compteurApres(
      jeu.techniciens.flatMap(({ indisponibilites }) => indisponibilites.map(({ id }) => id)),
    ),
  };
  return [
    ...routesDesFiches(contexte, urlApi),
    ...routesDesIndisponibilites(contexte, urlApi),
    http.get(urlApi('/users'), ({ request }) =>
      repondre(() => HttpResponse.json(listerComptes(jeu, request))),
    ),
  ];
}
