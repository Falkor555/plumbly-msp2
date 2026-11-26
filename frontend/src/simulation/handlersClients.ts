import { http, type HttpHandler, HttpResponse } from 'msw';
import type {
  Adresse,
  Client,
  Intervention,
  ModificationAdresse,
  ModificationClient,
  NouvelleAdresse,
  StatutIntervention,
  TriClients,
  TypeClient,
} from '../api/types';
import {
  type JeuDeDemonstration,
  resumeDeLAdresse,
  resumeDuClient,
  type TechnicienDeDemonstration,
} from './donneesDemonstration';
import {
  type Champs,
  comparerSansAccent,
  compteurApres,
  contientSansAccent,
  lireBooleenDeRequete,
  lireCodePostal,
  lireCorps,
  lireEmail,
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
 * Simulation en mémoire des routes des clients (docs/api.md, 6.5 ; back : backend/src/clients/) :
 * liste filtrée et triée, fiche, création, modification, archivage, adresses et historique. Les
 * contrôles et leurs messages sont ceux du back, dans le même ordre ; les règles d'intégrité de la
 * base (verrous, transactions) n'ont pas lieu d'être ici.
 */

const CHAMPS_IDENTITE = [
  'typeClient',
  'nomClient',
  'prenomClient',
  'raisonSociale',
  'telephone',
  'emailClient',
] as const;
const CHAMPS_ADRESSE = ['rue', 'complement', 'codePostal', 'ville', 'infosAcces'] as const;
const CRITERES_DE_LISTE = ['page', 'limit', 'recherche', 'typeClient', 'archives', 'tri'] as const;
const TYPES_CLIENT: readonly TypeClient[] = ['PARTICULIER', 'PROFESSIONNEL'];
const TRIS_CLIENTS: readonly TriClients[] = ['nomAffiche', '-nomAffiche', 'creeLe', '-creeLe'];
const STATUTS: readonly StatutIntervention[] = [
  'A_PLANIFIER',
  'PLANIFIEE',
  'EN_COURS',
  'TERMINEE',
  'ANNULEE',
];
/** Interventions qui empêchent d'archiver un client ou une adresse (regles-clients.ts). */
const STATUTS_ACTIFS: readonly StatutIntervention[] = ['A_PLANIFIER', 'PLANIFIEE', 'EN_COURS'];

const LONGUEUR_NOM = 100;
const LONGUEUR_RAISON_SOCIALE = 150;
const LONGUEUR_RUE = 255;
const LONGUEUR_COMPLEMENT = 255;
const LONGUEUR_VILLE = 100;
const LONGUEUR_INFOS_ACCES = 500;

const CLIENT_INTROUVABLE = 'Client introuvable.';
const CLIENT_ARCHIVE = 'Ce client est archivé : il ne peut plus être modifié.';

interface Options {
  urlApi: (chemin: string) => string;
  maintenant?: () => Date;
}

/** Ce que partagent les règles : le jeu, l'heure courante et les séquences d'identifiants. */
interface Contexte {
  jeu: JeuDeDemonstration;
  maintenant: () => Date;
  prochainIdClient: () => number;
  prochainIdAdresse: () => number;
}

interface FiltresClients {
  recherche?: string;
  typeClient?: TypeClient;
  archives: boolean;
  tri: TriClients;
}

type IdentiteClient = Pick<
  Client,
  'typeClient' | 'nomClient' | 'prenomClient' | 'raisonSociale' | 'telephone' | 'emailClient'
>;

type TourneeDuJeu = TechnicienDeDemonstration['tournees'][number];

// ---------- Lecture des entrées, comme clients.validation.ts ----------

function lireIdentite(champs: Champs, erreurs: string[], creation: boolean): ModificationClient {
  const facultatif = (maximum: number) => ({ obligatoire: false, maximum, effacable: true });
  return sansChampsAbsents({
    typeClient: lireEnumeration(champs, 'typeClient', TYPES_CLIENT, erreurs, {
      obligatoire: creation,
    }),
    nomClient: lireTexte(champs, 'nomClient', erreurs, facultatif(LONGUEUR_NOM)),
    prenomClient: lireTexte(champs, 'prenomClient', erreurs, facultatif(LONGUEUR_NOM)),
    raisonSociale: lireTexte(champs, 'raisonSociale', erreurs, facultatif(LONGUEUR_RAISON_SOCIALE)),
    telephone: lireTelephone(champs, 'telephone', erreurs, { obligatoire: creation }),
    emailClient: lireEmail(champs, 'emailClient', erreurs, { obligatoire: false, effacable: true }),
  });
}

function lireChampsAdresse(
  champs: Champs,
  erreurs: string[],
  creation: boolean,
): ModificationAdresse {
  const facultatif = (maximum: number) => ({ obligatoire: false, maximum, effacable: true });
  const obligatoire = (maximum: number) => ({ obligatoire: creation, maximum });
  return sansChampsAbsents({
    rue: lireTexte(champs, 'rue', erreurs, obligatoire(LONGUEUR_RUE)) ?? undefined,
    complement: lireTexte(champs, 'complement', erreurs, facultatif(LONGUEUR_COMPLEMENT)),
    codePostal: lireCodePostal(champs, 'codePostal', erreurs, { obligatoire: creation }),
    ville: lireTexte(champs, 'ville', erreurs, obligatoire(LONGUEUR_VILLE)) ?? undefined,
    infosAcces: lireTexte(champs, 'infosAcces', erreurs, facultatif(LONGUEUR_INFOS_ACCES)),
  });
}

/** L'adresse envoyée avec un nouveau client : ses erreurs sont préfixées par « adresse. ». */
function lireAdresseImbriquee(valeur: unknown, erreurs: string[]): NouvelleAdresse | undefined {
  if (valeur === undefined || valeur === null) {
    erreurs.push('adresse est obligatoire');
    return undefined;
  }
  if (typeof valeur !== 'object' || Array.isArray(valeur)) {
    erreurs.push('adresse doit être un objet');
    return undefined;
  }
  const champs = valeur as Champs;
  const inconnus = Object.keys(champs)
    .filter((cle) => !(CHAMPS_ADRESSE as readonly string[]).includes(cle))
    .map((cle) => `Le champ adresse.${cle} n’est pas autorisé`);
  const erreursDesChamps: string[] = [];
  const adresse = lireChampsAdresse(champs, erreursDesChamps, true);
  erreurs.push(...inconnus, ...erreursDesChamps.map((message) => `adresse.${message}`));
  return inconnus.length + erreursDesChamps.length > 0 ? undefined : (adresse as NouvelleAdresse);
}

/**
 * POST /clients, comme lireNouveauClient du back : l'identité et l'adresse sont lues ensemble (un
 * seul 400 pour toutes leurs erreurs), puis la règle nom / raison sociale est vérifiée à part,
 * avant toute création. Un envoi sans téléphone ni nom ne signale donc d'abord que le téléphone.
 */
function lireNouveauClient(corps: unknown): IdentiteClient & { adresse: NouvelleAdresse } {
  const champs = lireObjet(corps, [...CHAMPS_IDENTITE, 'adresse']);
  const erreurs: string[] = [];
  const identite = lireIdentite(champs, erreurs, true);
  const adresse = lireAdresseImbriquee(champs.adresse, erreurs);
  signalerErreurs(erreurs);
  const client = {
    typeClient: identite.typeClient as TypeClient,
    nomClient: identite.nomClient ?? null,
    prenomClient: identite.prenomClient ?? null,
    raisonSociale: identite.raisonSociale ?? null,
    telephone: identite.telephone as string,
    emailClient: identite.emailClient ?? null,
    adresse: adresse as NouvelleAdresse,
  };
  verifierIdentite(client);
  return client;
}

function lireModificationClient(corps: unknown): ModificationClient {
  const champs = lireObjet(corps, CHAMPS_IDENTITE);
  const erreurs: string[] = [];
  const modification = lireIdentite(champs, erreurs, false);
  signalerErreurs(erreurs);
  return modification;
}

function lireAdresse(corps: unknown, creation: boolean): ModificationAdresse {
  const champs = lireObjet(corps, CHAMPS_ADRESSE);
  const erreurs: string[] = [];
  const adresse = lireChampsAdresse(champs, erreurs, creation);
  signalerErreurs(erreurs);
  return adresse;
}

/** Un particulier a un nom, un professionnel une raison sociale (regles-clients.ts). */
function verifierIdentite(
  client: Pick<Client, 'typeClient' | 'nomClient' | 'raisonSociale'>,
): void {
  if (client.typeClient === 'PARTICULIER' && client.nomClient === null) {
    throw refuser(['nomClient est obligatoire pour un particulier']);
  }
  if (client.typeClient === 'PROFESSIONNEL' && client.raisonSociale === null) {
    throw refuser(['raisonSociale est obligatoire pour un professionnel']);
  }
}

function lireFiltres(request: Request): { pagination: Pagination; filtres: FiltresClients } {
  const champs = lireParametres(request, CRITERES_DE_LISTE);
  const erreurs: string[] = [];
  const pagination = lirePagination(champs, erreurs);
  const filtres: FiltresClients = {
    archives: lireBooleenDeRequete(champs, 'archives', erreurs),
    tri: lireTri(champs, TRIS_CLIENTS, 'nomAffiche', erreurs),
    recherche: lireRecherche(champs, erreurs),
    typeClient: lireEnumeration(champs, 'typeClient', TYPES_CLIENT, erreurs, {
      obligatoire: false,
    }),
  };
  signalerErreurs(erreurs);
  return { pagination, filtres };
}

function lireStatuts(valeur: unknown, erreurs: string[]): StatutIntervention[] | undefined {
  if (valeur === undefined) return undefined;
  const statuts = typeof valeur === 'string' ? valeur.split(',') : [];
  if (statuts.length === 0 || !statuts.every((statut) => STATUTS.includes(statut as never))) {
    erreurs.push(`statut doit contenir un ou plusieurs statuts parmi ${STATUTS.join(', ')}`);
    return undefined;
  }
  return [...new Set(statuts as StatutIntervention[])];
}

function lireFiltresHistorique(request: Request): {
  pagination: Pagination;
  statuts?: StatutIntervention[];
} {
  const champs = lireParametres(request, ['page', 'limit', 'statut']);
  const erreurs: string[] = [];
  const pagination = lirePagination(champs, erreurs);
  const statuts = lireStatuts(champs.statut, erreurs);
  signalerErreurs(erreurs);
  return { pagination, statuts };
}

// ---------- Recherche, tri et présentation, comme clients.repository.ts ----------

function adressesActives(client: Client): Adresse[] {
  return client.adresses.filter(({ archive }) => !archive);
}

/** Mêmes champs que le SQL du back ; le téléphone est comparé sans espaces ni points. */
function correspondALaRecherche(client: Client, recherche: string): boolean {
  const chiffres = recherche.replace(/[ .]/g, '');
  return (
    contientSansAccent(client.nomClient, recherche) ||
    contientSansAccent(client.prenomClient, recherche) ||
    contientSansAccent(client.raisonSociale, recherche) ||
    contientSansAccent(client.nomAffiche, recherche) ||
    (chiffres !== '' && client.telephone.includes(chiffres)) ||
    adressesActives(client).some(({ ville }) => contientSansAccent(ville, recherche))
  );
}

function correspond(client: Client, filtres: FiltresClients): boolean {
  if (!filtres.archives && client.archive) return false;
  if (filtres.typeClient !== undefined && client.typeClient !== filtres.typeClient) return false;
  return filtres.recherche === undefined || correspondALaRecherche(client, filtres.recherche);
}

/** Tri du back (ORDRES) : le champ demandé, puis l'identifiant pour départager. */
function comparerSelon(tri: TriClients): (premier: Client, second: Client) => number {
  const decroissant = tri.startsWith('-');
  const parValeur = tri.endsWith('nomAffiche')
    ? (a: Client, b: Client) => comparerSansAccent(a.nomAffiche, b.nomAffiche)
    : (a: Client, b: Client) => a.creeLe.localeCompare(b.creeLe);
  return (premier, second) => {
    const ordre = parValeur(premier, second) || premier.id - second.id;
    return decroissant ? -ordre : ordre;
  };
}

/** La liste ne montre que les adresses en service ; la fiche les montre toutes. */
function listerClients(jeu: JeuDeDemonstration, filtres: FiltresClients): Client[] {
  return jeu.clients
    .filter((client) => correspond(client, filtres))
    .sort(comparerSelon(filtres.tri))
    .map((client) => ({ ...client, adresses: adressesActives(client) }));
}

/** nomAffiche du back (interventions.presentation.ts). */
function nomAffiche(
  client: Pick<Client, 'typeClient' | 'nomClient' | 'prenomClient' | 'raisonSociale'>,
): string {
  if (client.typeClient === 'PROFESSIONNEL') return client.raisonSociale ?? '';
  return [client.prenomClient, client.nomClient].filter((morceau) => morceau !== null).join(' ');
}

// ---------- Interventions du jeu ----------

/** Les interventions elles-mêmes, à planifier ou dans une tournée (pas des copies). */
function interventionsDuJeu(jeu: JeuDeDemonstration): Intervention[] {
  const dansLesTournees = jeu.techniciens.flatMap(({ tournees }) =>
    tournees.flatMap(({ interventions }) => interventions),
  );
  return [...jeu.interventionsAPlanifier, ...dansLesTournees];
}

function avecSaTournee(
  technicien: TechnicienDeDemonstration,
  tournee: TourneeDuJeu,
): Intervention[] {
  const resume = {
    id: tournee.id,
    dateTournee: tournee.dateTournee,
    technicien: { id: technicien.id, nom: technicien.nom, prenom: technicien.prenom },
  };
  return tournee.interventions.map((intervention) => ({ ...intervention, tournee: resume }));
}

/** Les interventions telles que l'API les présente : chacune avec sa tournée, ou null. */
function interventionsPresentees(jeu: JeuDeDemonstration): Intervention[] {
  const dansLesTournees = jeu.techniciens.flatMap((technicien) =>
    technicien.tournees.flatMap((tournee) => avecSaTournee(technicien, tournee)),
  );
  return [...jeu.interventionsAPlanifier, ...dansLesTournees];
}

/** Ordre fixe du back (clients.repository.ts) : la création la plus récente d'abord. */
function historiqueDuClient(
  jeu: JeuDeDemonstration,
  idClient: number,
  statuts: StatutIntervention[] | undefined,
): Intervention[] {
  return interventionsPresentees(jeu)
    .filter(
      ({ client, statut }) =>
        client.id === idClient && (statuts === undefined || statuts.includes(statut)),
    )
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe) || b.id - a.id);
}

function interventionsActivesDuClient(jeu: JeuDeDemonstration, idClient: number): Intervention[] {
  return interventionsDuJeu(jeu).filter(
    ({ client, statut }) => client.id === idClient && STATUTS_ACTIFS.includes(statut),
  );
}

/**
 * Le back lit le client et l'adresse d'une intervention en direct (interventions.presentation.ts) :
 * après une modification, l'historique, le planning et la tournée montrent les nouvelles valeurs.
 */
function reporterSurLesInterventions(jeu: JeuDeDemonstration, client: Client): void {
  for (const intervention of interventionsDuJeu(jeu)) {
    if (intervention.client.id !== client.id) continue;
    intervention.client = resumeDuClient(client);
    const adresse = client.adresses.find(({ id }) => id === intervention.adresse.id);
    if (adresse !== undefined) intervention.adresse = resumeDeLAdresse(adresse);
  }
}

// ---------- Règles, comme clients.service.ts et regles-clients.ts ----------

function trouverClient(jeu: JeuDeDemonstration, id: number): Client {
  const client = jeu.clients.find((candidat) => candidat.id === id);
  if (!client) throw refuser(CLIENT_INTROUVABLE, 404);
  return client;
}

function trouverClientModifiable(jeu: JeuDeDemonstration, id: number): Client {
  const client = trouverClient(jeu, id);
  if (client.archive) throw refuser(CLIENT_ARCHIVE);
  return client;
}

/** Une adresse d'un autre client répond 404, comme une adresse inexistante. */
function trouverAdresseDuClient(client: Client, id: number): Adresse {
  const adresse = client.adresses.find((candidate) => candidate.id === id);
  if (!adresse) throw refuser('Adresse introuvable pour ce client.', 404);
  return adresse;
}

function creerAdresse(nouvelle: NouvelleAdresse, id: number): Adresse {
  return {
    id,
    rue: nouvelle.rue,
    complement: nouvelle.complement ?? null,
    codePostal: nouvelle.codePostal,
    ville: nouvelle.ville,
    infosAcces: nouvelle.infosAcces ?? null,
    archive: false,
    archiveLe: null,
  };
}

/** Les identifiants ne sont attribués qu'une fois le corps accepté : un 400 n'en consomme pas. */
function creerClient(contexte: Contexte, corps: unknown): Client {
  const { adresse, ...identite } = lireNouveauClient(corps);
  const creeLe = contexte.maintenant().toISOString();
  return {
    id: contexte.prochainIdClient(),
    ...identite,
    nomAffiche: nomAffiche(identite),
    archive: false,
    archiveLe: null,
    creeLe,
    majLe: creeLe,
    adresses: [creerAdresse(adresse, contexte.prochainIdAdresse())],
  };
}

/** La règle nom / raison sociale porte sur le client modifié, comme dans le service du back. */
function modifierClient(
  { jeu, maintenant }: Contexte,
  client: Client,
  modification: ModificationClient,
): void {
  const modifie: Client = { ...client, ...modification };
  verifierIdentite(modifie);
  Object.assign(client, modifie, {
    nomAffiche: nomAffiche(modifie),
    majLe: maintenant().toISOString(),
  });
  reporterSurLesInterventions(jeu, client);
}

function archiverClient({ jeu, maintenant }: Contexte, client: Client): void {
  if (client.archive) throw refuser('Ce client est déjà archivé.');
  const actives = interventionsActivesDuClient(jeu, client.id).length;
  if (actives > 0) {
    throw refuser(
      'Impossible d’archiver ce client tant qu’il a des interventions à planifier, ' +
        `planifiées ou en cours (${actives} actuellement) : terminez-les ou annulez-les d’abord.`,
      409,
    );
  }
  Object.assign(client, { archive: true, archiveLe: maintenant().toISOString() });
}

function modifierAdresse(
  jeu: JeuDeDemonstration,
  client: Client,
  adresse: Adresse,
  modification: ModificationAdresse,
): void {
  if (adresse.archive) {
    throw refuser('Cette adresse est archivée : elle ne peut plus être modifiée.');
  }
  Object.assign(adresse, modification);
  reporterSurLesInterventions(jeu, client);
}

/** Ordre du service du back : déjà archivée, dernière adresse en service (RG21), puis 409. */
function archiverAdresse({ jeu, maintenant }: Contexte, client: Client, adresse: Adresse): void {
  if (adresse.archive) throw refuser('Cette adresse est déjà archivée.');
  if (adressesActives(client).length <= 1) {
    throw refuser(
      'C’est la dernière adresse du client : ajoutez-en une autre avant d’archiver celle-ci.',
    );
  }
  const actives = interventionsActivesDuClient(jeu, client.id).filter(
    (intervention) => intervention.adresse.id === adresse.id,
  ).length;
  if (actives > 0) {
    throw refuser(
      'Impossible d’archiver cette adresse tant qu’elle a des interventions à planifier, ' +
        `planifiées ou en cours (${actives} actuellement) : terminez-les ou annulez-les d’abord.`,
      409,
    );
  }
  Object.assign(adresse, { archive: true, archiveLe: maintenant().toISOString() });
}

// ---------- Routes ----------

/*
 * Comme le contrôleur du back, l'identifiant du chemin puis le corps ou les paramètres sont lus
 * avant de chercher le client : un corps invalide envoyé à un client inexistant donne 400, pas 404.
 */

function routesDesClients(contexte: Contexte, urlApi: Options['urlApi']): HttpHandler[] {
  const { jeu } = contexte;
  return [
    http.get(urlApi('/clients'), ({ request }) =>
      repondre(() => {
        const { pagination, filtres } = lireFiltres(request);
        return HttpResponse.json(paginer(listerClients(jeu, filtres), pagination));
      }),
    ),
    http.post(urlApi('/clients'), ({ request }) =>
      repondre(async () => {
        const client = creerClient(contexte, await lireCorps(request));
        jeu.clients.push(client);
        return HttpResponse.json(client, { status: 201 });
      }),
    ),
    http.get(urlApi('/clients/:id'), ({ params }) =>
      repondre(() => HttpResponse.json(trouverClient(jeu, lireIdentifiant(params.id)))),
    ),
    http.patch(urlApi('/clients/:id'), ({ params, request }) =>
      repondre(async () => {
        const id = lireIdentifiant(params.id);
        const modification = lireModificationClient(await lireCorps(request));
        const client = trouverClientModifiable(jeu, id);
        modifierClient(contexte, client, modification);
        return HttpResponse.json(client);
      }),
    ),
    http.post(urlApi('/clients/:id/archive'), ({ params }) =>
      repondre(() => {
        const client = trouverClient(jeu, lireIdentifiant(params.id));
        archiverClient(contexte, client);
        return HttpResponse.json(client);
      }),
    ),
  ];
}

function routeDeLHistorique({ jeu }: Contexte, urlApi: Options['urlApi']): HttpHandler {
  return http.get(urlApi('/clients/:id/interventions'), ({ params, request }) =>
    repondre(() => {
      const id = lireIdentifiant(params.id);
      const { pagination, statuts } = lireFiltresHistorique(request);
      const client = trouverClient(jeu, id);
      return HttpResponse.json(paginer(historiqueDuClient(jeu, client.id, statuts), pagination));
    }),
  );
}

function routesDesAdresses(contexte: Contexte, urlApi: Options['urlApi']): HttpHandler[] {
  const { jeu } = contexte;
  return [
    http.post(urlApi('/clients/:id/addresses'), ({ params, request }) =>
      repondre(async () => {
        const id = lireIdentifiant(params.id);
        const nouvelle = lireAdresse(await lireCorps(request), true) as NouvelleAdresse;
        const client = trouverClientModifiable(jeu, id);
        const adresse = creerAdresse(nouvelle, contexte.prochainIdAdresse());
        client.adresses.push(adresse);
        return HttpResponse.json(adresse, { status: 201 });
      }),
    ),
    http.patch(urlApi('/clients/:id/addresses/:aid'), ({ params, request }) =>
      repondre(async () => {
        const id = lireIdentifiant(params.id);
        const idAdresse = lireIdentifiant(params.aid);
        const modification = lireAdresse(await lireCorps(request), false);
        const client = trouverClientModifiable(jeu, id);
        const adresse = trouverAdresseDuClient(client, idAdresse);
        modifierAdresse(jeu, client, adresse, modification);
        return HttpResponse.json(adresse);
      }),
    ),
    http.post(urlApi('/clients/:id/addresses/:aid/archive'), ({ params }) =>
      repondre(() => {
        const id = lireIdentifiant(params.id);
        const idAdresse = lireIdentifiant(params.aid);
        const client = trouverClientModifiable(jeu, id);
        const adresse = trouverAdresseDuClient(client, idAdresse);
        archiverAdresse(contexte, client, adresse);
        return HttpResponse.json(adresse);
      }),
    ),
  ];
}

export function creerHandlersClients(
  jeu: JeuDeDemonstration,
  { urlApi, maintenant = () => new Date() }: Options,
): HttpHandler[] {
  const contexte: Contexte = {
    jeu,
    maintenant,
    prochainIdClient: compteurApres(jeu.clients.map(({ id }) => id)),
    prochainIdAdresse: compteurApres(
      jeu.clients.flatMap(({ adresses }) => adresses.map(({ id }) => id)),
    ),
  };
  return [
    ...routesDesClients(contexte, urlApi),
    routeDeLHistorique(contexte, urlApi),
    ...routesDesAdresses(contexte, urlApi),
  ];
}
