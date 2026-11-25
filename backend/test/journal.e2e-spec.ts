import { Logger } from '@nestjs/common';
import { type Collection, type Document, MongoClient } from 'mongodb';
import { inject } from 'vitest';
import type { UtilisateurConnecte } from '../src/commun/autorisation/utilisateur-connecte.js';
import { StatutIntervention, Urgence } from '../src/generated/prisma/client.ts';
import { DUREE_CONSERVATION_JOURNAUX_D_ACCES_EN_SECONDES } from '../src/journal/journal.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import {
  type ApplicationDeTest,
  creerCompte,
  demarrerApplication,
  requetesEn,
  viderLaBase,
} from './support/application-de-test.js';
import { enDataUrl, fabriquerPng } from './support/fabriquer-png.js';

/*
 * Tests d'intégration du journal des actions (#27) : planification réelle dans PostgreSQL,
 * journal réel dans le MongoDB éphémère, puis lecture par GET /interventions/:id/history.
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const MARDI = '2026-12-08';
const NOM_COLLECTION = 'journal_actions';
// Port 1 : réservé, aucun serveur n'y écoute. La connexion est refusée.
const URL_MONGODB_INJOIGNABLE = 'mongodb://127.0.0.1:1/plumbly_test?directConnection=true';
const CHAMPS_PERSONNELS = [
  'email',
  'motDePasse',
  'motDePasseHash',
  'nom',
  'prenom',
  'telephone',
  'nomSignataire',
  'image',
];

interface Donnees {
  admin: UtilisateurConnecte;
  gestionnaire: UtilisateurConnecte;
  technicien: UtilisateurConnecte;
  idTournee: number;
  idIntervention: number;
}

function mardiA(heure: string): string {
  return `${MARDI}T${heure}:00+04:00`;
}

/** Comptes, client, tournée du mardi et une intervention « à planifier ». */
async function creerDonnees(prisma: PrismaService): Promise<Donnees> {
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
  const fiche = await prisma.technicien.create({
    data: {
      telephone: '0692000001',
      couleurPlanning: '#0F766E',
      utilisateur: {
        create: {
          email: 'kevin@test.re',
          nom: 'Hoarau',
          prenom: 'Kévin',
          role: 'TECHNICIEN',
          motDePasseHash: 'inutilise-dans-ce-test',
        },
      },
    },
  });
  const tournee = await prisma.tournee.create({
    data: {
      idTechnicien: fiche.id,
      dateTournee: new Date(`${MARDI}T00:00:00Z`),
      idCreateur: gestionnaire.id,
    },
  });
  const idIntervention = await creerIntervention(prisma, gestionnaire.id);
  return {
    admin,
    gestionnaire,
    technicien: { id: fiche.idUtilisateur, role: 'TECHNICIEN' },
    idTournee: tournee.id,
    idIntervention,
  };
}

async function creerIntervention(
  prisma: PrismaService,
  idCreateur: number,
  planification: { idTournee: number; debutPrevu: string } | undefined = undefined,
): Promise<number> {
  const client = await prisma.client.create({
    data: {
      typeClient: 'PARTICULIER',
      nomClient: 'Hoareau',
      prenomClient: 'Josiane',
      telephone: '0262000101',
      adresses: { create: [{ rue: '12 rue de Paris', codePostal: '97400', ville: 'Saint-Denis' }] },
    },
    include: { adresses: true },
  });
  const type = await prisma.typeIntervention.upsert({
    where: { libelle: 'Recherche de fuite' },
    create: { libelle: 'Recherche de fuite', dureeDefautMin: 60 },
    update: {},
  });
  const intervention = await prisma.intervention.create({
    data: {
      description: 'Fuite sous l’évier',
      urgence: Urgence.NORMALE,
      dureeEstimeeMin: 60,
      statut:
        planification === undefined ? StatutIntervention.A_PLANIFIER : StatutIntervention.PLANIFIEE,
      idTournee: planification?.idTournee,
      ordreTournee: planification === undefined ? undefined : 1,
      debutPrevu: planification === undefined ? undefined : new Date(planification.debutPrevu),
      idAdresse: client.adresses[0].id,
      idTypeIntervention: type.id,
      idCreateur,
    },
  });
  return intervention.id;
}

/** Toutes les clés d'un document, à tous les niveaux. */
function clesDe(valeur: unknown): string[] {
  if (typeof valeur !== 'object' || valeur === null || valeur instanceof Date) {
    return [];
  }
  return Object.entries(valeur).flatMap(([cle, sousValeur]) => [cle, ...clesDe(sousValeur)]);
}

describe('journal des actions dans MongoDB (e2e)', () => {
  let application: ApplicationDeTest;
  let mongo: MongoClient;
  let journal: Collection<Document>;
  let donnees: Donnees;

  beforeAll(async () => {
    application = await demarrerApplication(MAINTENANT, { journalReel: true });
    mongo = new MongoClient(inject('urlMongoDbDeTest'));
    journal = mongo.db().collection(NOM_COLLECTION);
  });

  beforeEach(async () => {
    await viderLaBase(application.prisma);
    // deleteMany et non drop : les index créés au démarrage de l'API sont conservés.
    await journal.deleteMany({});
    donnees = await creerDonnees(application.prisma);
  });

  afterAll(async () => {
    await journal.deleteMany({});
    await viderLaBase(application.prisma);
    await mongo.close();
    await application.app.close();
  });

  function planifier(idIntervention: number, heure = '08:00') {
    return requetesEn(application.app, donnees.gestionnaire)
      .post(`/tours/${donnees.idTournee}/interventions`)
      .send({ interventionId: idIntervention, debutPrevu: mardiA(heure) });
  }

  function historique(idIntervention: number | string, utilisateur?: UtilisateurConnecte) {
    return requetesEn(application.app, utilisateur).get(`/interventions/${idIntervention}/history`);
  }

  /**
   * Documents du journal, dans l'ordre d'écriture, une fois qu'il y en a `nombre`. Le filtre des
   * 403 écrit sans attendre MongoDB : son document arrive juste après la réponse.
   */
  async function documentsUneFoisEcrits(nombre: number): Promise<Document[]> {
    await vi.waitFor(async () => {
      expect(await journal.countDocuments()).toBe(nombre);
    });
    return journal.find({}).sort({ _id: 1 }).toArray();
  }

  function creerCollegue(): Promise<UtilisateurConnecte> {
    return creerCompte(application.prisma, {
      email: 'mathieu@test.re',
      nom: 'Rivière',
      prenom: 'Mathieu',
      role: 'TECHNICIEN',
    });
  }

  it('planifier une intervention crée un document STATUT_MODIFIE dans journal_actions', async () => {
    await planifier(donnees.idIntervention).expect(200);

    const documents = await journal.find({}).toArray();
    expect(documents).toEqual([
      {
        _id: expect.anything(),
        date: MAINTENANT,
        action: 'STATUT_MODIFIE',
        auteur: { id: donnees.gestionnaire.id, role: 'GESTIONNAIRE' },
        entite: { type: 'intervention', id: donnees.idIntervention },
        avant: { statut: 'A_PLANIFIER' },
        apres: { statut: 'PLANIFIEE' },
      },
    ]);
  });

  it('GET /interventions/:id/history renvoie l’entrée au format du contrat', async () => {
    await planifier(donnees.idIntervention).expect(200);

    const reponse = await historique(donnees.idIntervention, donnees.gestionnaire).expect(200);

    expect(reponse.body).toEqual([
      {
        date: '2026-12-07T05:00:00.000Z',
        action: 'STATUT_MODIFIE',
        auteur: {
          id: donnees.gestionnaire.id,
          nom: 'Payet',
          prenom: 'Céline',
          role: 'GESTIONNAIRE',
        },
        avant: { statut: 'A_PLANIFIER' },
        apres: { statut: 'PLANIFIEE' },
      },
    ]);
  });

  it('le retrait de la tournée ajoute une deuxième entrée, renvoyée en premier', async () => {
    await planifier(donnees.idIntervention).expect(200);
    await requetesEn(application.app, donnees.gestionnaire)
      .delete(`/tours/${donnees.idTournee}/interventions/${donnees.idIntervention}`)
      .expect(200);

    const reponse = await historique(donnees.idIntervention, donnees.admin).expect(200);

    // L'horloge est figée : les deux entrées ont la même date, _id les départage.
    expect(reponse.body.map((entree: { apres: unknown }) => entree.apres)).toEqual([
      { statut: 'A_PLANIFIER' },
      { statut: 'PLANIFIEE' },
    ]);
  });

  it('une planification refusée (chevauchement, 409) n’écrit rien dans le journal', async () => {
    await creerIntervention(application.prisma, donnees.gestionnaire.id, {
      idTournee: donnees.idTournee,
      debutPrevu: mardiA('09:00'),
    });

    await planifier(donnees.idIntervention, '09:30').expect(409);

    expect(await journal.countDocuments()).toBe(0);
  });

  it('aucun document ne contient de donnée personnelle', async () => {
    await planifier(donnees.idIntervention).expect(200);
    await requetesEn(application.app, donnees.gestionnaire)
      .delete(`/tours/${donnees.idTournee}/interventions/${donnees.idIntervention}`)
      .expect(200);

    const cles = (await journal.find({}).toArray()).flatMap(clesDe);

    expect(cles.length).toBeGreaterThan(0);
    expect(cles.filter((cle) => CHAMPS_PERSONNELS.includes(cle))).toEqual([]);
  });

  it('une clôture signée écrit SIGNATURE_ENREGISTREE, sans l’image ni le nom du signataire (US33)', async () => {
    await application.prisma.intervention.update({
      where: { id: donnees.idIntervention },
      data: {
        statut: StatutIntervention.EN_COURS,
        idTournee: donnees.idTournee,
        ordreTournee: 1,
        debutPrevu: new Date(mardiA('08:00')),
        demarreeLe: new Date(mardiA('08:05')),
      },
    });
    const image = enDataUrl(fabriquerPng());

    await requetesEn(application.app, donnees.technicien)
      .post(`/interventions/${donnees.idIntervention}/complete`)
      .send({ compteRendu: 'Joint remplacé.', signature: { nomSignataire: 'Jean Dupont', image } })
      .expect(200);

    const { empreinte } = await application.prisma.signatureIntervention.findUniqueOrThrow({
      where: { idIntervention: donnees.idIntervention },
    });
    const documents = await journal.find({}).sort({ _id: 1 }).toArray();
    expect(documents.map((document) => document.action)).toEqual([
      'STATUT_MODIFIE',
      'SIGNATURE_ENREGISTREE',
    ]);
    expect(documents[1]).toEqual({
      _id: expect.anything(),
      date: MAINTENANT,
      action: 'SIGNATURE_ENREGISTREE',
      auteur: { id: donnees.technicien.id, role: 'TECHNICIEN' },
      entite: { type: 'intervention', id: donnees.idIntervention },
      contexte: { empreinte },
    });
    const texte = JSON.stringify(documents);
    expect(texte).not.toContain('Jean Dupont');
    expect(texte).not.toContain(image.slice(22, 62));
    expect(documents.flatMap(clesDe).filter((cle) => CHAMPS_PERSONNELS.includes(cle))).toEqual([]);

    const historiqueLu = await historique(donnees.idIntervention, donnees.gestionnaire).expect(200);
    expect(historiqueLu.body).toContainEqual(
      expect.objectContaining({ action: 'SIGNATURE_ENREGISTREE', contexte: { empreinte } }),
    );
  });
  it('crée au démarrage les index du modèle de données, dont le TTL partiel des journaux d’accès', async () => {
    const index = await journal.listIndexes().toArray();

    expect(index).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'historique_entite',
          key: { 'entite.type': 1, 'entite.id': 1, date: -1 },
        }),
        expect.objectContaining({ name: 'actions_auteur', key: { 'auteur.id': 1, date: -1 } }),
        expect.objectContaining({ name: 'suivi_actions', key: { action: 1, date: -1 } }),
        expect.objectContaining({
          name: 'expiration_journaux_d_acces',
          key: { date: 1 },
          expireAfterSeconds: DUREE_CONSERVATION_JOURNAUX_D_ACCES_EN_SECONDES,
          partialFilterExpression: {
            action: { $in: ['CONNEXION_REUSSIE', 'CONNEXION_ECHOUEE', 'ACCES_REFUSE'] },
          },
        }),
      ]),
    );
  });

  describe('TS-02 : changement de statut fait par un technicien', () => {
    const AUJOURDHUI = '2026-12-07';

    /** Intervention planifiée dans la tournée du jour du technicien : RG24 permet de la démarrer. */
    async function interventionDuJour(): Promise<number> {
      const { prisma } = application;
      const fiche = await prisma.technicien.findUniqueOrThrow({
        where: { idUtilisateur: donnees.technicien.id },
      });
      const tournee = await prisma.tournee.create({
        data: {
          idTechnicien: fiche.id,
          dateTournee: new Date(`${AUJOURDHUI}T00:00:00Z`),
          idCreateur: donnees.gestionnaire.id,
        },
      });
      return creerIntervention(prisma, donnees.gestionnaire.id, {
        idTournee: tournee.id,
        debutPrevu: `${AUJOURDHUI}T10:00:00+04:00`,
      });
    }

    it('TS-02 : le technicien qui démarre son intervention écrit STATUT_MODIFIE, sans donnée personnelle', async () => {
      const id = await interventionDuJour();

      await requetesEn(application.app, donnees.technicien)
        .post(`/interventions/${id}/start`)
        .expect(200);

      const documents = await journal.find({}).toArray();
      expect(documents).toEqual([
        {
          _id: expect.anything(),
          date: MAINTENANT,
          action: 'STATUT_MODIFIE',
          auteur: { id: donnees.technicien.id, role: 'TECHNICIEN' },
          entite: { type: 'intervention', id },
          avant: { statut: 'PLANIFIEE' },
          apres: { statut: 'EN_COURS' },
        },
      ]);
      expect(documents.flatMap(clesDe).filter((cle) => CHAMPS_PERSONNELS.includes(cle))).toEqual(
        [],
      );
    });

    it('TS-02 : l’historique relit l’entrée avec le nom et le prénom du technicien, lus dans PostgreSQL', async () => {
      const id = await interventionDuJour();
      await requetesEn(application.app, donnees.technicien)
        .post(`/interventions/${id}/start`)
        .expect(200);

      const reponse = await historique(id, donnees.gestionnaire).expect(200);

      expect(reponse.body).toEqual([
        {
          date: '2026-12-07T05:00:00.000Z',
          action: 'STATUT_MODIFIE',
          auteur: { id: donnees.technicien.id, nom: 'Hoarau', prenom: 'Kévin', role: 'TECHNICIEN' },
          avant: { statut: 'PLANIFIEE' },
          apres: { statut: 'EN_COURS' },
        },
      ]);
    });

    it('TS-02 : un collègue refusé en 403 n’ajoute aucun changement de statut, seulement son refus', async () => {
      const id = await interventionDuJour();
      const collegue = await creerCollegue();

      await requetesEn(application.app, collegue).post(`/interventions/${id}/start`).expect(403);

      const documents = await documentsUneFoisEcrits(1);
      expect(documents.map((document) => document.action)).toEqual(['ACCES_REFUSE']);
      const intervention = await application.prisma.intervention.findUniqueOrThrow({
        where: { id },
      });
      expect(intervention.statut).toBe('PLANIFIEE');
    });

    it('TS-03 : ce refus est tracé avec le collègue pour auteur et le modèle de route', async () => {
      const id = await interventionDuJour();
      const collegue = await creerCollegue();

      await requetesEn(application.app, collegue).post(`/interventions/${id}/start`).expect(403);

      expect(await documentsUneFoisEcrits(1)).toEqual([
        {
          _id: expect.anything(),
          date: MAINTENANT,
          action: 'ACCES_REFUSE',
          auteur: { id: collegue.id, role: 'TECHNICIEN' },
          entite: { type: 'utilisateur', id: collegue.id },
          contexte: { methode: 'POST', route: '/api/v1/interventions/:id/start' },
        },
      ]);
    });
  });

  describe('TS-03 : les accès refusés (403) sont journalisés', () => {
    it('TS-03 : un gestionnaire refusé sur POST /intervention-types laisse ACCES_REFUSE, sans donnée personnelle', async () => {
      const reponse = await requetesEn(application.app, donnees.gestionnaire)
        .post('/intervention-types')
        .send({ libelle: 'Débouchage', dureeDefautMin: 30 })
        .expect(403);

      // Le corps de la réponse est celui de NestJS, inchangé par le filtre.
      expect(reponse.body).toEqual({
        statusCode: 403,
        message: 'Accès refusé.',
        error: 'Forbidden',
      });
      const documents = await documentsUneFoisEcrits(1);
      expect(documents).toEqual([
        {
          _id: expect.anything(),
          date: MAINTENANT,
          action: 'ACCES_REFUSE',
          auteur: { id: donnees.gestionnaire.id, role: 'GESTIONNAIRE' },
          entite: { type: 'utilisateur', id: donnees.gestionnaire.id },
          contexte: { methode: 'POST', route: '/api/v1/intervention-types' },
        },
      ]);
      expect(documents.flatMap(clesDe).filter((cle) => CHAMPS_PERSONNELS.includes(cle))).toEqual(
        [],
      );
    });

    it('TS-03 : un 403 sur une recherche ne laisse pas « Hélène » dans le journal', async () => {
      await requetesEn(application.app, donnees.technicien)
        .get('/interventions')
        .query({ recherche: 'Hélène' })
        .expect(403);

      const documents = await documentsUneFoisEcrits(1);
      expect(documents[0].contexte).toEqual({ methode: 'GET', route: '/api/v1/interventions' });
      const texte = JSON.stringify(documents);
      for (const fragment of ['Hélène', 'H%C3%A9l%C3%A8ne', 'recherche']) {
        expect(texte).not.toContain(fragment);
      }
    });

    it('TS-03 : un 401 (sans utilisateur) n’est pas journalisé', async () => {
      await requetesEn(application.app).post('/intervention-types').send({}).expect(401);
      // Un 403 envoyé juste après sert de repère : une fois son document écrit, une trace du 401
      // aurait eu le temps d'arriver elle aussi.
      await requetesEn(application.app, donnees.gestionnaire)
        .post('/intervention-types')
        .send({})
        .expect(403);

      const documents = await documentsUneFoisEcrits(1);
      expect(documents.map(({ action, auteur }) => ({ action, auteur }))).toEqual([
        { action: 'ACCES_REFUSE', auteur: { id: donnees.gestionnaire.id, role: 'GESTIONNAIRE' } },
      ]);
    });
  });

  describe('droits et validation de GET /interventions/:id/history', () => {
    it('répond 401 sans utilisateur connecté', async () => {
      await historique(donnees.idIntervention).expect(401);
    });

    it('répond 403 à un technicien', async () => {
      await historique(donnees.idIntervention, donnees.technicien).expect(403);

      // Attendu ici : écrit après le test, ce document se mêlerait au suivant.
      const documents = await documentsUneFoisEcrits(1);
      expect(documents.map((document) => document.action)).toEqual(['ACCES_REFUSE']);
    });

    it('répond 404 pour une intervention inexistante', async () => {
      await historique(999_999, donnees.admin).expect(404);
    });

    it('répond 400 à un identifiant {"$ne":0} (injection NoSQL)', async () => {
      const reponse = await historique('%7B%22%24ne%22%3A0%7D', donnees.admin).expect(400);

      expect(reponse.body.message).toBe('Identifiant invalide.');
    });
  });
});

describe('journal des actions avec MongoDB injoignable (e2e)', () => {
  let application: ApplicationDeTest;
  let donnees: Donnees;
  let avertissementsAuDemarrage: unknown[][];
  const urlMongoDbDeTest = process.env.MONGODB_URI;

  beforeAll(async () => {
    const avertissement = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    process.env.MONGODB_URI = URL_MONGODB_INJOIGNABLE;
    try {
      application = await demarrerApplication(MAINTENANT, { journalReel: true });
    } finally {
      // L'URL n'est lue qu'à la création du client : les autres fichiers retrouvent la bonne.
      process.env.MONGODB_URI = urlMongoDbDeTest;
    }
    // Copiés ici : Vitest efface les appels enregistrés avant chaque test.
    avertissementsAuDemarrage = [...avertissement.mock.calls];
    donnees = await creerDonnees(application.prisma);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await viderLaBase(application.prisma);
    await application.app.close();
  });

  it('démarre l’API malgré MongoDB éteint, avec un avertissement', () => {
    expect(avertissementsAuDemarrage).toEqual([
      [expect.stringContaining('MongoDB injoignable : index du journal non créés')],
    ]);
  });

  it('planifie quand même l’intervention et trace l’échec du journal', async () => {
    const erreur = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await requetesEn(application.app, donnees.gestionnaire)
      .post(`/tours/${donnees.idTournee}/interventions`)
      .send({ interventionId: donnees.idIntervention, debutPrevu: mardiA('08:00') })
      .expect(200);

    const intervention = await application.prisma.intervention.findUniqueOrThrow({
      where: { id: donnees.idIntervention },
    });
    expect(intervention.statut).toBe('PLANIFIEE');
    expect(erreur).toHaveBeenCalledWith(
      `STATUT_MODIFIE non enregistré dans le journal des actions (intervention ${donnees.idIntervention})`,
      expect.any(String),
    );
  });

  it('répond 503 à la lecture de l’historique, jamais une liste vide', async () => {
    const reponse = await requetesEn(application.app, donnees.gestionnaire)
      .get(`/interventions/${donnees.idIntervention}/history`)
      .expect(503);

    expect(reponse.body.message).toMatch(/Historique temporairement indisponible/);
  });
});
