import { Logger, RequestMethod, type Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { AppController } from '../src/app.controller.js';
import { ClientsRepository } from '../src/clients/clients.repository.js';
import { CLE_ROLES } from '../src/commun/autorisation/roles.decorator.js';
import { RolesGuard } from '../src/commun/autorisation/roles.guard.js';
import type { UtilisateurConnecte } from '../src/commun/autorisation/utilisateur-connecte.js';
import { type Role, StatutIntervention, Urgence } from '../src/generated/prisma/client.ts';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  type ApplicationDeTest,
  creerCompte,
  demarrerApplication,
  requetesEn,
  viderLaBase,
} from './support/application-de-test.js';

/*
 * Preuves des mesures de sécurité de l'API (issue #46), présentées à la soutenance. Chaque test
 * porte l'identifiant de la mesure qu'il démontre (TS-xx).
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const AUJOURDHUI = '2026-12-07';
const ADRESSE = { rue: '12 rue des Lilas', codePostal: '97400', ville: 'Saint-Denis' };
const CHAMP_INCONNU = { estAdmin: true };
const REFUS_DU_CHAMP_INCONNU = ['Le champ estAdmin n’est pas autorisé'];

/** Route telle que NestJS l'a enregistrée, sans le préfixe /api/v1. */
interface RouteExposee {
  methode: string;
  chemin: string;
  controleur: Type;
  nomMethode: string;
  gestionnaire: Gestionnaire;
}

/** Méthode de contrôleur : NestJS pose ses métadonnées sur la fonction elle-même. */
type Gestionnaire = (...parametres: never[]) => unknown;

type Verbe = 'get' | 'post' | 'patch' | 'put' | 'delete';

const reflecteur = new Reflector();

/**
 * Seule route volontairement publique. Toute autre exception doit être ajoutée ici, avec sa
 * raison, pour que la relecture la voie.
 */
const CONTROLEURS_PUBLICS: ReadonlyMap<Type, string> = new Map<Type, string>([
  [
    AppController,
    'GET /api/v1 renvoie un message de bienvenue qui prouve que l’API répond ; ' +
      'elle ne lit ni n’écrit aucune donnée.',
  ],
]);

/** Routes de tous les contrôleurs chargés par NestJS : un contrôleur ajouté demain y figure. */
function routesDeLApplication(conteneur: ModulesContainer): RouteExposee[] {
  return [...conteneur.values()]
    .flatMap((module) => [...module.controllers.values()])
    .flatMap(({ metatype }) => routesDuControleur(metatype as Type));
}

function routesDuControleur(controleur: Type): RouteExposee[] {
  const prototype = controleur.prototype as Record<string, Gestionnaire>;
  // Même parcours que celui du routeur de NestJS : les méthodes héritées comptent aussi.
  return new MetadataScanner().getAllMethodNames(prototype).flatMap((nomMethode) => {
    const gestionnaire = prototype[nomMethode];
    const methode = reflecteur.get(METHOD_METADATA, gestionnaire) as RequestMethod | undefined;
    if (methode === undefined) {
      return [];
    }
    return cheminsDe(controleur, gestionnaire).map((chemin) => ({
      methode: RequestMethod[methode],
      chemin,
      controleur,
      nomMethode,
      gestionnaire,
    }));
  });
}

function cheminsDe(controleur: Type, gestionnaire: Gestionnaire): string[] {
  const prefixes = [reflecteur.get(PATH_METADATA, controleur) as string | string[]].flat();
  const suffixes = [reflecteur.get(PATH_METADATA, gestionnaire) as string | string[]].flat();
  return prefixes.flatMap((prefixe) =>
    suffixes.map((suffixe) => {
      const morceaux = [prefixe, suffixe].flatMap((morceau) => morceau.split('/'));
      return `/${morceaux.filter((morceau) => morceau !== '').join('/')}`;
    }),
  );
}

function decrire(route: RouteExposee): string {
  return `${route.methode} ${route.chemin} (${route.controleur.name}.${route.nomMethode})`;
}

/** Ce qui manque à la route pour être fermée par défaut ; vide si elle est protégée. */
function defautsDeProtection(route: RouteExposee): string[] {
  const gardes = [route.controleur, route.gestionnaire].flatMap(
    (cible) => (reflecteur.get(GUARDS_METADATA, cible) as unknown[] | undefined) ?? [],
  );
  // Même lecture que RolesGuard : le @Roles de la méthode remplace celui du contrôleur.
  const roles = reflecteur.getAllAndOverride(CLE_ROLES, [route.gestionnaire, route.controleur]) as
    Role[] | undefined;
  const defauts: string[] = [];
  if (!gardes.includes(RolesGuard)) {
    defauts.push('RolesGuard absent');
  }
  if (roles === undefined || roles.length === 0) {
    defauts.push('aucun rôle déclaré par @Roles');
  }
  return defauts;
}

function verbeDe(route: RouteExposee): Verbe {
  const verbe = route.methode.toLowerCase();
  if (!['get', 'post', 'patch', 'put', 'delete'].includes(verbe)) {
    throw new Error(`Méthode HTTP non prévue par ce test : ${decrire(route)}`);
  }
  return verbe as Verbe;
}

// L'application est démarrée avant la collecte des tests : it.each a besoin de la liste des
// routes au moment où il déclare ses cas, avant tout beforeAll.
const application = await demarrerApplication(MAINTENANT);
const ROUTES = routesDeLApplication(application.app.get(ModulesContainer));
const ROUTES_PUBLIQUES = ROUTES.filter((route) => CONTROLEURS_PUBLICS.has(route.controleur));
const ROUTES_PROTEGEES = ROUTES.filter((route) => !CONTROLEURS_PUBLICS.has(route.controleur));

afterAll(async () => {
  await viderLaBase(application.prisma);
  await application.app.close();
});

describe('TS-01 : aucune route n’est ouverte par défaut', () => {
  it('TS-01 : le parcours trouve plus de 30 routes, dont une seule publique : GET /', () => {
    expect(ROUTES.length).toBeGreaterThan(30);
    expect(ROUTES_PUBLIQUES.map(decrire)).toEqual(['GET / (AppController.getHello)']);
  });

  it('TS-01 : chaque route protégée pose RolesGuard et déclare ses rôles avec @Roles', () => {
    const fautives = ROUTES_PROTEGEES.map((route) => ({
      route: decrire(route),
      defauts: defautsDeProtection(route),
    })).filter(({ defauts }) => defauts.length > 0);

    expect(fautives).toEqual([]);
  });

  it.each(ROUTES_PROTEGEES)(
    'TS-01 : $methode $chemin répond 401 sans utilisateur',
    async (route) => {
      const url = route.chemin.replace(/:\w+/g, '1');

      const reponse = await requetesEn(application.app)[verbeDe(route)](url).send({});

      expect(reponse.status).toBe(401);
      expect(reponse.body).toEqual({
        statusCode: 401,
        message: 'Authentification requise.',
        error: 'Unauthorized',
      });
    },
  );
});

/** Identifiants qui existent en base : sans eux, la route aurait pu répondre 404 avant de lire. */
interface Fixtures {
  admin: UtilisateurConnecte;
  gestionnaire: UtilisateurConnecte;
  technicien: UtilisateurConnecte;
  idClient: number;
  idAdresse: number;
  idTechnicien: number;
  idTournee: number;
  idIntervention: number;
  idType: number;
}

type Profil = 'admin' | 'gestionnaire' | 'technicien';

/** Route qui lit un corps ou des paramètres de requête, appelée par un utilisateur autorisé. */
interface RouteQuiLit {
  methode: 'GET' | 'POST' | 'PATCH' | 'PUT';
  route: string;
  profil: Profil;
  url: (fixtures: Fixtures) => string;
}

const ROUTES_QUI_LISENT_UN_CORPS: RouteQuiLit[] = [
  { methode: 'POST', route: '/clients', profil: 'gestionnaire', url: () => '/clients' },
  {
    methode: 'PATCH',
    route: '/clients/:id',
    profil: 'gestionnaire',
    url: (f) => `/clients/${f.idClient}`,
  },
  {
    methode: 'POST',
    route: '/clients/:id/addresses',
    profil: 'gestionnaire',
    url: (f) => `/clients/${f.idClient}/addresses`,
  },
  {
    methode: 'PATCH',
    route: '/clients/:id/addresses/:addressId',
    profil: 'gestionnaire',
    url: (f) => `/clients/${f.idClient}/addresses/${f.idAdresse}`,
  },
  { methode: 'POST', route: '/interventions', profil: 'gestionnaire', url: () => '/interventions' },
  {
    methode: 'PATCH',
    route: '/interventions/:id',
    profil: 'gestionnaire',
    url: (f) => `/interventions/${f.idIntervention}`,
  },
  {
    methode: 'POST',
    route: '/interventions/:id/cancel',
    profil: 'gestionnaire',
    url: (f) => `/interventions/${f.idIntervention}/cancel`,
  },
  {
    methode: 'POST',
    route: '/interventions/:id/start',
    profil: 'technicien',
    url: (f) => `/interventions/${f.idIntervention}/start`,
  },
  {
    methode: 'POST',
    route: '/interventions/:id/complete',
    profil: 'technicien',
    url: (f) => `/interventions/${f.idIntervention}/complete`,
  },
  {
    methode: 'PATCH',
    route: '/interventions/:id/report',
    profil: 'technicien',
    url: (f) => `/interventions/${f.idIntervention}/report`,
  },
  { methode: 'POST', route: '/technicians', profil: 'gestionnaire', url: () => '/technicians' },
  {
    methode: 'PATCH',
    route: '/technicians/:id',
    profil: 'gestionnaire',
    url: (f) => `/technicians/${f.idTechnicien}`,
  },
  {
    methode: 'POST',
    route: '/technicians/:id/unavailabilities',
    profil: 'gestionnaire',
    url: (f) => `/technicians/${f.idTechnicien}/unavailabilities`,
  },
  { methode: 'POST', route: '/tours', profil: 'gestionnaire', url: () => '/tours' },
  {
    methode: 'POST',
    route: '/tours/:id/interventions',
    profil: 'gestionnaire',
    url: (f) => `/tours/${f.idTournee}/interventions`,
  },
  {
    methode: 'PUT',
    route: '/tours/:id/order',
    profil: 'gestionnaire',
    url: (f) => `/tours/${f.idTournee}/order`,
  },
  {
    methode: 'POST',
    route: '/intervention-types',
    profil: 'admin',
    url: () => '/intervention-types',
  },
  {
    methode: 'PATCH',
    route: '/intervention-types/:id',
    profil: 'admin',
    url: (f) => `/intervention-types/${f.idType}`,
  },
];

const ROUTES_QUI_LISENT_LA_REQUETE: RouteQuiLit[] = [
  { methode: 'GET', route: '/clients', profil: 'gestionnaire', url: () => '/clients' },
  {
    methode: 'GET',
    route: '/clients/export',
    profil: 'gestionnaire',
    url: () => '/clients/export',
  },
  {
    methode: 'GET',
    route: '/clients/:id/interventions',
    profil: 'gestionnaire',
    url: (f) => `/clients/${f.idClient}/interventions`,
  },
  { methode: 'GET', route: '/interventions', profil: 'gestionnaire', url: () => '/interventions' },
  { methode: 'GET', route: '/technicians', profil: 'gestionnaire', url: () => '/technicians' },
  {
    methode: 'GET',
    route: '/technicians/:id/unavailabilities',
    profil: 'gestionnaire',
    url: (f) => `/technicians/${f.idTechnicien}/unavailabilities`,
  },
  { methode: 'GET', route: '/tours', profil: 'gestionnaire', url: () => '/tours' },
];

/** Routes dont une méthode reçoit @Body() (ou @Query()), lues dans les métadonnées de NestJS. */
function routesQuiLisent(source: RouteParamtypes.BODY | RouteParamtypes.QUERY): string[] {
  return ROUTES.filter((route) => {
    const parametres = (Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      route.controleur,
      route.nomMethode,
    ) ?? {}) as Record<string, unknown>;
    // Clés « type:position », par exemple « 3:1 » pour un @Body() en deuxième paramètre.
    return Object.keys(parametres).some((cle) => cle.startsWith(`${source}:`));
  })
    .map(({ methode, chemin }) => `${methode} ${chemin}`)
    .sort();
}

function decrireLaMatrice(routes: RouteQuiLit[]): string[] {
  return routes.map(({ methode, route }) => `${methode} ${route}`).sort();
}

/** Toutes les lignes de toutes les tables métier, pour prouver que rien n'a bougé. */
async function etatDeLaBase(prisma: PrismaService) {
  const parIdentifiant = { orderBy: { id: 'asc' } } as const;
  return {
    utilisateur: await prisma.utilisateur.findMany(parIdentifiant),
    client: await prisma.client.findMany(parIdentifiant),
    adresse: await prisma.adresse.findMany(parIdentifiant),
    technicien: await prisma.technicien.findMany(parIdentifiant),
    indisponibilite: await prisma.indisponibilite.findMany(parIdentifiant),
    tournee: await prisma.tournee.findMany(parIdentifiant),
    typeIntervention: await prisma.typeIntervention.findMany(parIdentifiant),
    intervention: await prisma.intervention.findMany(parIdentifiant),
    signatureIntervention: await prisma.signatureIntervention.findMany({
      orderBy: { idIntervention: 'asc' },
    }),
  };
}

async function creerFixtures(prisma: PrismaService): Promise<Fixtures> {
  const admin = await creerCompte(prisma, {
    email: 'admin@test.re',
    nom: 'Bidel',
    prenom: 'Arnaud',
    role: 'ADMIN',
  });
  const gestionnaire = await creerCompte(prisma, {
    email: 'gestion@test.re',
    nom: 'Payet',
    prenom: 'Céline',
    role: 'GESTIONNAIRE',
  });
  const technicien = await creerCompte(prisma, {
    email: 'kevin@test.re',
    nom: 'Hoarau',
    prenom: 'Kévin',
    role: 'TECHNICIEN',
  });
  const fiche = await prisma.technicien.create({
    data: { telephone: '0692000001', couleurPlanning: '#0F766E', idUtilisateur: technicien.id },
  });
  const client = await prisma.client.create({
    data: {
      typeClient: 'PARTICULIER',
      nomClient: 'Grondin',
      prenomClient: 'Hélène',
      telephone: '0262000001',
      adresses: { create: [ADRESSE] },
    },
    include: { adresses: true },
  });
  const type = await prisma.typeIntervention.create({
    data: { libelle: 'Fuite', dureeDefautMin: 60 },
  });
  const tournee = await prisma.tournee.create({
    data: {
      idTechnicien: fiche.id,
      dateTournee: new Date(`${AUJOURDHUI}T00:00:00Z`),
      idCreateur: gestionnaire.id,
    },
  });
  const intervention = await prisma.intervention.create({
    data: {
      description: 'Fuite sous l’évier',
      urgence: Urgence.NORMALE,
      dureeEstimeeMin: 60,
      statut: StatutIntervention.PLANIFIEE,
      idTournee: tournee.id,
      ordreTournee: 1,
      debutPrevu: new Date(`${AUJOURDHUI}T10:00:00+04:00`),
      idAdresse: client.adresses[0].id,
      idTypeIntervention: type.id,
      idCreateur: gestionnaire.id,
    },
  });
  return {
    admin,
    gestionnaire,
    technicien,
    idClient: client.id,
    idAdresse: client.adresses[0].id,
    idTechnicien: fiche.id,
    idTournee: tournee.id,
    idIntervention: intervention.id,
    idType: type.id,
  };
}

describe('TS-05 : un champ inconnu est refusé sur chaque route', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    await viderLaBase(application.prisma);
    fixtures = await creerFixtures(application.prisma);
  });

  const en = (profil: Profil) => requetesEn(application.app, fixtures[profil]);

  function envoyer(route: RouteQuiLit) {
    const url = route.url(fixtures);
    const requetes = en(route.profil);
    switch (route.methode) {
      case 'GET':
        return requetes.get(url);
      case 'POST':
        return requetes.post(url);
      case 'PATCH':
        return requetes.patch(url);
      case 'PUT':
        return requetes.put(url);
    }
  }

  it('TS-05 : la matrice couvre toutes les routes qui lisent un corps (18) ou une requête (7)', () => {
    expect(decrireLaMatrice(ROUTES_QUI_LISENT_UN_CORPS)).toEqual(
      routesQuiLisent(RouteParamtypes.BODY),
    );
    expect(decrireLaMatrice(ROUTES_QUI_LISENT_LA_REQUETE)).toEqual(
      routesQuiLisent(RouteParamtypes.QUERY),
    );
    expect([ROUTES_QUI_LISENT_UN_CORPS.length, ROUTES_QUI_LISENT_LA_REQUETE.length]).toEqual([
      18, 7,
    ]);
  });

  it.each(ROUTES_QUI_LISENT_UN_CORPS)(
    'TS-05 : $methode $route refuse le corps { estAdmin: true } en 400, sans rien écrire',
    async (route) => {
      const avant = await etatDeLaBase(application.prisma);

      const reponse = await envoyer(route).send(CHAMP_INCONNU);

      expect(reponse.status).toBe(400);
      expect(reponse.body).toEqual({
        statusCode: 400,
        message: REFUS_DU_CHAMP_INCONNU,
        error: 'Bad Request',
      });
      expect(await etatDeLaBase(application.prisma)).toEqual(avant);
    },
  );

  it.each(ROUTES_QUI_LISENT_LA_REQUETE)(
    'TS-05 : $methode $route refuse le paramètre ?estAdmin=true en 400',
    async (route) => {
      const reponse = await envoyer(route).query(CHAMP_INCONNU);

      expect(reponse.status).toBe(400);
      expect(reponse.body).toEqual({
        statusCode: 400,
        message: REFUS_DU_CHAMP_INCONNU,
        error: 'Bad Request',
      });
    },
  );

  it('TS-05 : PATCH /interventions/:id refuse { statut: "TERMINEE" } et l’intervention reste planifiée', async () => {
    const avant = await etatDeLaBase(application.prisma);

    const reponse = await en('gestionnaire')
      .patch(`/interventions/${fixtures.idIntervention}`)
      .send({ statut: 'TERMINEE' })
      .expect(400);

    expect(reponse.body.message).toEqual(['Le champ statut n’est pas autorisé']);
    expect(await etatDeLaBase(application.prisma)).toEqual(avant);
    const intervention = await application.prisma.intervention.findUniqueOrThrow({
      where: { id: fixtures.idIntervention },
    });
    expect(intervention).toMatchObject({ statut: 'PLANIFIEE', termineeLe: null });
  });

  it('TS-05 : POST /clients refuse un champ inconnu caché dans l’adresse, et aucun client n’est créé', async () => {
    const avant = await etatDeLaBase(application.prisma);

    const reponse = await en('gestionnaire')
      .post('/clients')
      .send({
        typeClient: 'PARTICULIER',
        nomClient: 'Técher',
        telephone: '0692123456',
        adresse: { ...ADRESSE, estAdmin: true },
      })
      .expect(400);

    expect(reponse.body.message).toEqual(['Le champ adresse.estAdmin n’est pas autorisé']);
    expect(await etatDeLaBase(application.prisma)).toEqual(avant);
  });

  it('TS-05 : POST /clients/:id/archive ne lit pas de corps : { archive: false, id: 999 } n’a aucun effet', async () => {
    const { id: idClient } = await application.prisma.client.create({
      data: {
        typeClient: 'PARTICULIER',
        nomClient: 'Técher',
        telephone: '0692123456',
        adresses: { create: [ADRESSE] },
      },
    });
    const autresClients = () =>
      application.prisma.client.findMany({
        where: { id: { not: idClient } },
        orderBy: { id: 'asc' },
      });
    const avant = await autresClients();

    const reponse = await en('gestionnaire')
      .post(`/clients/${idClient}/archive`)
      .send({ archive: false, id: 999 })
      .expect(200);

    // La route fait son travail normal, sur le client de l'URL : le corps est ignoré.
    expect(reponse.body).toMatchObject({ id: idClient, archive: true });
    const archive = await application.prisma.client.findUniqueOrThrow({ where: { id: idClient } });
    expect(archive.archive).toBe(true);
    expect(await application.prisma.client.findUnique({ where: { id: 999 } })).toBeNull();
    expect(await autresClients()).toEqual(avant);
  });
});

describe('TS-06 : une erreur interne ne fuit pas vers le client', () => {
  // Message qui trahirait le schéma de la base et la requête s'il arrivait au navigateur.
  const ERREUR_SQL = 'relation "client" does not exist — SELECT * FROM client WHERE …';
  const rechercher = vi.fn(() => {
    throw new Error(ERREUR_SQL);
  });
  let applicationEnPanne: ApplicationDeTest;
  let gestionnaire: UtilisateurConnecte;

  beforeAll(async () => {
    applicationEnPanne = await demarrerApplication(MAINTENANT, {
      doubles: [[ClientsRepository, { rechercher }]],
    });
    gestionnaire = await creerCompte(applicationEnPanne.prisma, {
      email: 'gestion@test.re',
      nom: 'Payet',
      prenom: 'Céline',
      role: 'GESTIONNAIRE',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await viderLaBase(applicationEnPanne.prisma);
    await applicationEnPanne.app.close();
  });

  it('TS-06 : GET /clients répond 500 avec un message générique, sans le texte de l’erreur', async () => {
    // NestJS trace l'erreur complète côté serveur (non vérifié ici) : la sortie des tests reste lisible.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const reponse = await requetesEn(applicationEnPanne.app, gestionnaire).get('/clients');

    // L'erreur vient bien du repository remplacé, pas d'une autre panne.
    expect(rechercher).toHaveBeenCalledOnce();
    expect(reponse.status).toBe(500);
    expect(reponse.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    const reponseComplete = reponse.text + JSON.stringify(reponse.headers);
    for (const fragment of [ERREUR_SQL, 'relation', 'SELECT', 'does not exist']) {
      expect(reponseComplete).not.toContain(fragment);
    }
  });
});
