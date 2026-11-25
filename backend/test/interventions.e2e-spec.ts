import type { UtilisateurConnecte } from '../src/commun/autorisation/utilisateur-connecte.js';
import { StatutIntervention, Urgence } from '../src/generated/prisma/client.ts';
import { JournalDesActions } from '../src/journal/journal-des-actions.js';
import {
  type ApplicationDeTest,
  creerCompte,
  demarrerApplication,
  requetesEn,
  viderLaBase,
} from './support/application-de-test.js';
import { enDataUrl, fabriquerPng } from './support/fabriquer-png.js';

/*
 * Tests d'intégration des interventions (issue #17) : routes HTTP, machine à états, droits,
 * verrous et requêtes SQL ensemble, sur la base éphémère de Testcontainers.
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const AUJOURDHUI = '2026-12-07';
const MARDI = '2026-12-08';

interface Technicien {
  idTechnicien: number;
  compte: UtilisateurConnecte;
}

interface Fixtures {
  admin: UtilisateurConnecte;
  gestionnaire: UtilisateurConnecte;
  kevin: Technicien;
  mathieu: Technicien;
  idType: number;
  /** Adresse de Mme Hélène Grondin, particulière. */
  idAdresseHelene: number;
  idClientHelene: number;
  /** Adresse de l'hôtel des Lilas, professionnel. */
  idAdresseHotel: number;
  idClientHotel: number;
  idAdresseArchivee: number;
  idAdresseDuClientArchive: number;
}

/** Instant à La Réunion, aujourd'hui ou un autre jour. */
function a(heure: string, jour = AUJOURDHUI): string {
  return `${jour}T${heure}:00+04:00`;
}

describe('interventions (e2e)', () => {
  let application: ApplicationDeTest;
  let fixtures: Fixtures;
  let journal: { enregistrer: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    application = await demarrerApplication(MAINTENANT);
    fixtures = await creerFixtures(application);
    // Le journal simulé de l'application de test, espionné pour vérifier les entrées écrites.
    const simule = application.app.get(JournalDesActions);
    journal = { enregistrer: vi.spyOn(simule, 'enregistrer') as ReturnType<typeof vi.fn> };
  });

  beforeEach(async () => {
    journal.enregistrer.mockClear();
    await application.prisma.$executeRaw`
      TRUNCATE TABLE signature_intervention, intervention, tournee, indisponibilite RESTART IDENTITY`;
  });

  afterAll(async () => {
    await viderLaBase(application.prisma);
    await application.app.close();
  });

  const en = (utilisateur?: UtilisateurConnecte) => requetesEn(application.app, utilisateur);

  async function creerTournee(technicien: Technicien, jour = AUJOURDHUI): Promise<number> {
    const tournee = await application.prisma.tournee.create({
      data: {
        idTechnicien: technicien.idTechnicien,
        dateTournee: new Date(`${jour}T00:00:00Z`),
        idCreateur: fixtures.gestionnaire.id,
      },
    });
    return tournee.id;
  }

  async function creerIntervention(
    donnees: {
      statut?: StatutIntervention;
      urgence?: Urgence;
      idTournee?: number;
      ordreTournee?: number;
      debutPrevu?: string;
      dureeEstimeeMin?: number;
      demarreeLe?: string;
      creeLe?: string;
      description?: string;
      idAdresse?: number;
    } = {},
  ): Promise<number> {
    const intervention = await application.prisma.intervention.create({
      data: {
        description: donnees.description ?? 'Fuite sous l’évier',
        urgence: donnees.urgence ?? Urgence.NORMALE,
        dureeEstimeeMin: donnees.dureeEstimeeMin ?? 60,
        statut: donnees.statut ?? StatutIntervention.A_PLANIFIER,
        idTournee: donnees.idTournee,
        ordreTournee: donnees.ordreTournee,
        debutPrevu: donnees.debutPrevu === undefined ? undefined : new Date(donnees.debutPrevu),
        demarreeLe: donnees.demarreeLe === undefined ? undefined : new Date(donnees.demarreeLe),
        creeLe: donnees.creeLe === undefined ? undefined : new Date(donnees.creeLe),
        idAdresse: donnees.idAdresse ?? fixtures.idAdresseHelene,
        idTypeIntervention: fixtures.idType,
        idCreateur: fixtures.gestionnaire.id,
      },
    });
    return intervention.id;
  }

  /** Intervention planifiée dans une tournée, au rang et à l'heure donnés. */
  function planifiee(idTournee: number, ordreTournee: number, heure: string, jour = AUJOURDHUI) {
    return creerIntervention({
      statut: StatutIntervention.PLANIFIEE,
      idTournee,
      ordreTournee,
      debutPrevu: a(heure, jour),
    });
  }

  async function rangsDeLaTournee(idTournee: number): Promise<[number, number | null][]> {
    const interventions = await application.prisma.intervention.findMany({
      where: { idTournee },
      orderBy: { ordreTournee: 'asc' },
      select: { id: true, ordreTournee: true },
    });
    return interventions.map(({ id, ordreTournee }) => [id, ordreTournee]);
  }

  function idsDe(reponse: { body: { data: { id: number }[] } }): number[] {
    return reponse.body.data.map(({ id }) => id);
  }

  describe('POST /interventions : créer (US14)', () => {
    it('crée l’intervention à planifier, avec la durée du type, le client déduit de l’adresse et le créateur connecté', async () => {
      const reponse = await en(fixtures.gestionnaire)
        .post('/interventions')
        .send({
          adresseId: fixtures.idAdresseHelene,
          typeInterventionId: fixtures.idType,
          description: '  Fuite sous l’évier  ',
          urgence: 'URGENTE',
        })
        .expect(201);

      expect(reponse.body).toMatchObject({
        statut: 'A_PLANIFIER',
        description: 'Fuite sous l’évier',
        urgence: 'URGENTE',
        dureeEstimeeMin: 45,
        debutPrevu: null,
        tournee: null,
        enRetard: false,
        client: { id: fixtures.idClientHelene, nomAffiche: 'Hélène Grondin' },
        createur: { id: fixtures.gestionnaire.id, nom: 'Payet', prenom: 'Céline' },
        type: { id: fixtures.idType, libelle: 'Fuite' },
      });
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });

    it.each([
      ['une adresse archivée', () => fixtures.idAdresseArchivee],
      ['l’adresse d’un client archivé', () => fixtures.idAdresseDuClientArchive],
      ['une adresse inexistante', () => 999],
    ])('refuse en 400 %s, sans rien créer', async (_cas, idAdresse) => {
      await en(fixtures.gestionnaire)
        .post('/interventions')
        .send({
          adresseId: idAdresse(),
          typeInterventionId: fixtures.idType,
          description: 'Fuite',
          urgence: 'NORMALE',
        })
        .expect(400);

      expect(await application.prisma.intervention.count()).toBe(0);
    });

    it('refuse en 400 un type inexistant et un champ inconnu', async () => {
      const corps = {
        adresseId: fixtures.idAdresseHelene,
        typeInterventionId: fixtures.idType,
        description: 'Fuite',
        urgence: 'NORMALE',
      };

      await en(fixtures.gestionnaire)
        .post('/interventions')
        .send({ ...corps, typeInterventionId: 999 })
        .expect(400);
      await en(fixtures.gestionnaire)
        .post('/interventions')
        .send({ ...corps, statut: 'TERMINEE' })
        .expect(400);
    });

    it('répond 403 à un technicien', async () => {
      await en(fixtures.kevin.compte).post('/interventions').send({}).expect(403);
    });
  });

  describe('GET /interventions/:id : consulter (US14, US24)', () => {
    it('montre au technicien son intervention et lui refuse celle d’un collègue', async () => {
      const sienne = await planifiee(await creerTournee(fixtures.kevin), 1, '10:00');
      const collegue = await planifiee(await creerTournee(fixtures.mathieu), 1, '10:00');

      const reponse = await en(fixtures.kevin.compte).get(`/interventions/${sienne}`).expect(200);
      await en(fixtures.kevin.compte).get(`/interventions/${collegue}`).expect(403);

      expect(reponse.body.tournee.technicien).toEqual({
        id: fixtures.kevin.idTechnicien,
        nom: 'Hoarau',
        prenom: 'Kévin',
      });
    });

    it('refuse en 403 au technicien une intervention à planifier', async () => {
      const aPlanifier = await creerIntervention();

      await en(fixtures.kevin.compte).get(`/interventions/${aPlanifier}`).expect(403);
    });

    it('répond 404 pour une intervention inexistante, 400 pour un identifiant invalide, 401 sans utilisateur', async () => {
      await en(fixtures.gestionnaire).get('/interventions/999').expect(404);
      await en(fixtures.kevin.compte).get('/interventions/999').expect(404);
      await en(fixtures.gestionnaire).get('/interventions/abc').expect(400);
      await en().get('/interventions/1').expect(401);
    });
  });

  describe('GET /interventions : lister et filtrer (US15)', () => {
    it('RG18 : urgentes, puis prioritaires, puis normales ; la plus ancienne d’abord', async () => {
      const normaleAncienne = await creerIntervention({ creeLe: a('07:00'), urgence: 'NORMALE' });
      const urgenteRecente = await creerIntervention({ creeLe: a('08:30'), urgence: 'URGENTE' });
      const prioritaire = await creerIntervention({ creeLe: a('07:30'), urgence: 'PRIORITAIRE' });
      const urgenteAncienne = await creerIntervention({ creeLe: a('08:00'), urgence: 'URGENTE' });
      await planifiee(await creerTournee(fixtures.kevin), 1, '10:00');

      const reponse = await en(fixtures.gestionnaire)
        .get('/interventions?statut=A_PLANIFIER&limit=100')
        .expect(200);

      expect(idsDe(reponse)).toEqual([
        urgenteAncienne,
        urgenteRecente,
        prioritaire,
        normaleAncienne,
      ]);
      expect(reponse.body.meta).toEqual({ page: 1, limit: 100, total: 4, totalPages: 1 });
    });

    it('combine statut, urgence, technicien, client et période', async () => {
      const tourneeKevin = await creerTournee(fixtures.kevin, MARDI);
      const tourneeMathieu = await creerTournee(fixtures.mathieu, MARDI);
      const attendue = await creerIntervention({
        statut: 'PLANIFIEE',
        urgence: 'URGENTE',
        idTournee: tourneeKevin,
        ordreTournee: 1,
        debutPrevu: a('08:00', MARDI),
      });
      await creerIntervention({
        statut: 'PLANIFIEE',
        urgence: 'NORMALE',
        idTournee: tourneeKevin,
        ordreTournee: 2,
        debutPrevu: a('10:00', MARDI),
      });
      await creerIntervention({
        statut: 'PLANIFIEE',
        urgence: 'URGENTE',
        idTournee: tourneeMathieu,
        ordreTournee: 1,
        debutPrevu: a('08:00', MARDI),
      });
      await creerIntervention({
        statut: 'PLANIFIEE',
        urgence: 'URGENTE',
        idTournee: tourneeKevin,
        ordreTournee: 3,
        debutPrevu: a('12:00', MARDI),
        idAdresse: fixtures.idAdresseHotel,
      });
      await creerIntervention({ urgence: 'URGENTE' });
      // Les deux statuts de la liste sont retenus ; un troisième, sinon identique, est écarté.
      const enCours = await creerIntervention({
        statut: 'EN_COURS',
        urgence: 'URGENTE',
        idTournee: tourneeKevin,
        ordreTournee: 4,
        debutPrevu: a('14:00', MARDI),
      });
      await creerIntervention({
        statut: 'TERMINEE',
        urgence: 'URGENTE',
        idTournee: tourneeKevin,
        ordreTournee: 5,
        debutPrevu: a('16:00', MARDI),
      });

      const reponse = await en(fixtures.gestionnaire)
        .get(
          `/interventions?statut=PLANIFIEE,EN_COURS&urgence=URGENTE&technicienId=${fixtures.kevin.idTechnicien}` +
            `&clientId=${fixtures.idClientHelene}&du=${MARDI}&au=${MARDI}`,
        )
        .expect(200);

      expect(idsDe(reponse)).toEqual([attendue, enCours]);
    });

    it('filtre sur les jours à La Réunion, pas sur les jours UTC', async () => {
      // Mardi 0 h 30 à La Réunion, c'est encore lundi 20 h 30 en UTC : il compte pour mardi.
      const lundiSoir = await creerIntervention({
        statut: 'PLANIFIEE',
        idTournee: await creerTournee(fixtures.kevin),
        ordreTournee: 1,
        debutPrevu: a('23:30'),
      });
      const mardiMatin = await creerIntervention({
        statut: 'PLANIFIEE',
        idTournee: await creerTournee(fixtures.kevin, MARDI),
        ordreTournee: 1,
        debutPrevu: a('00:30', MARDI),
      });

      const lundi = await en(fixtures.gestionnaire).get(
        `/interventions?du=${AUJOURDHUI}&au=${AUJOURDHUI}`,
      );
      const mardi = await en(fixtures.gestionnaire).get(`/interventions?du=${MARDI}`);

      expect(idsDe(lundi)).toEqual([lundiSoir]);
      expect(idsDe(mardi)).toEqual([mardiMatin]);
    });

    it('cherche sans tenir compte des accents ni de la casse, dans le client et la description', async () => {
      const chezHelene = await creerIntervention({ description: 'Robinet qui goutte' });
      const aLHotel = await creerIntervention({
        description: 'Chauffe-eau en panne',
        idAdresse: fixtures.idAdresseHotel,
      });

      const parClient = await en(fixtures.gestionnaire).get('/interventions?recherche=helene');
      const parDescription = await en(fixtures.gestionnaire).get(
        '/interventions?recherche=CHAUFFE',
      );
      const parRaisonSociale = await en(fixtures.gestionnaire).get(
        '/interventions?recherche=hotel',
      );

      expect(idsDe(parClient)).toEqual([chezHelene]);
      expect(idsDe(parDescription)).toEqual([aLHotel]);
      expect(idsDe(parRaisonSociale)).toEqual([aLHotel]);
    });

    it('TI10 : une recherche contenant du SQL ne renvoie rien d’inattendu', async () => {
      await creerIntervention();

      const reponse = await en(fixtures.gestionnaire)
        .get('/interventions')
        .query({ recherche: "' OR 1=1 --" })
        .expect(200);

      expect(reponse.body.data).toEqual([]);
      expect(await application.prisma.intervention.count()).toBe(1);
    });

    it('traite « 100% » comme du texte, pas comme un joker', async () => {
      const centPourCent = await creerIntervention({ description: 'Bouché à 100% depuis hier' });
      await creerIntervention({ description: 'Bouché à 100 mètres' });

      const reponse = await en(fixtures.gestionnaire)
        .get('/interventions')
        .query({ recherche: '100%' });

      expect(idsDe(reponse)).toEqual([centPourCent]);
    });

    it('trie par début prévu, les interventions sans créneau en dernier', async () => {
      const tournee = await creerTournee(fixtures.kevin);
      const aPlanifier = await creerIntervention();
      const tard = await planifiee(tournee, 2, '14:00');
      const tot = await planifiee(tournee, 1, '10:00');

      const reponse = await en(fixtures.gestionnaire).get('/interventions?tri=debutPrevu');

      expect(idsDe(reponse)).toEqual([tot, tard, aPlanifier]);
    });

    it('pagine sans sauter ni répéter d’intervention à urgence et date égales', async () => {
      const ids = [];
      for (let numero = 0; numero < 5; numero += 1) {
        ids.push(await creerIntervention({ creeLe: a('08:00') }));
      }

      const premiere = await en(fixtures.gestionnaire).get('/interventions?limit=3&page=1');
      const seconde = await en(fixtures.gestionnaire).get('/interventions?limit=3&page=2');

      expect([...idsDe(premiere), ...idsDe(seconde)]).toEqual(ids);
      expect(seconde.body.meta).toEqual({ page: 2, limit: 3, total: 5, totalPages: 2 });
    });

    it.each([
      ['statut=FOO'],
      ['statut=A_PLANIFIER,FOO'],
      ['urgence=urgente'],
      ['tri=-description'],
      ['du=2026-13-01'],
      ['inconnu=1'],
    ])('répond 400 à %s', async (parametres) => {
      await en(fixtures.gestionnaire).get(`/interventions?${parametres}`).expect(400);
    });

    it('répond 403 à un technicien et 401 sans utilisateur', async () => {
      await en(fixtures.kevin.compte).get('/interventions').expect(403);
      await en().get('/interventions').expect(401);
    });
  });
  describe('cycle complet (critère « Terminé quand » de l’issue)', () => {
    it('créer → affecter → démarrer → terminer → compléter le compte rendu', async () => {
      const gestionnaire = en(fixtures.gestionnaire);
      const kevin = en(fixtures.kevin.compte);
      const consulter = async (id: number) =>
        (await gestionnaire.get(`/interventions/${id}`).expect(200)).body;

      const creee = await gestionnaire
        .post('/interventions')
        .send({
          adresseId: fixtures.idAdresseHelene,
          typeInterventionId: fixtures.idType,
          description: 'Chasse d’eau qui fuit',
          urgence: 'PRIORITAIRE',
          dureeEstimeeMin: 60,
        })
        .expect(201);
      const id: number = creee.body.id;
      expect(await consulter(id)).toMatchObject({ statut: 'A_PLANIFIER', tournee: null });

      const tournee = await gestionnaire
        .post('/tours')
        .send({ technicienId: fixtures.kevin.idTechnicien, dateTournee: AUJOURDHUI })
        .expect(201);
      await gestionnaire
        .post(`/tours/${tournee.body.id}/interventions`)
        .send({ interventionId: id, debutPrevu: a('10:00') })
        .expect(200);
      expect(await consulter(id)).toMatchObject({
        statut: 'PLANIFIEE',
        debutPrevu: new Date(a('10:00')).toISOString(),
        finPrevue: new Date(a('11:00')).toISOString(),
        ordreTournee: 1,
        demarreeLe: null,
      });

      const demarree = await kevin.post(`/interventions/${id}/start`).expect(200);
      expect(demarree.body).toMatchObject({
        statut: 'EN_COURS',
        demarreeLe: MAINTENANT.toISOString(),
        termineeLe: null,
      });

      const terminee = await kevin.post(`/interventions/${id}/complete`).expect(200);
      expect(terminee.body).toMatchObject({
        statut: 'TERMINEE',
        demarreeLe: MAINTENANT.toISOString(),
        termineeLe: MAINTENANT.toISOString(),
        compteRendu: null,
      });

      await kevin
        .patch(`/interventions/${id}/report`)
        .send({ compteRendu: 'Joint de la chasse remplacé.' })
        .expect(200);
      expect(await consulter(id)).toMatchObject({
        statut: 'TERMINEE',
        compteRendu: 'Joint de la chasse remplacé.',
      });

      expect(journal.enregistrer.mock.calls.map(([action]) => action)).toEqual([
        {
          type: 'STATUT_MODIFIE',
          auteur: { id: fixtures.gestionnaire.id, role: 'GESTIONNAIRE' },
          interventionId: id,
          ancienStatut: 'A_PLANIFIER',
          nouveauStatut: 'PLANIFIEE',
        },
        {
          type: 'STATUT_MODIFIE',
          auteur: { id: fixtures.kevin.compte.id, role: 'TECHNICIEN' },
          interventionId: id,
          ancienStatut: 'PLANIFIEE',
          nouveauStatut: 'EN_COURS',
        },
        {
          type: 'STATUT_MODIFIE',
          auteur: { id: fixtures.kevin.compte.id, role: 'TECHNICIEN' },
          interventionId: id,
          ancienStatut: 'EN_COURS',
          nouveauStatut: 'TERMINEE',
        },
      ]);
    });

    it('enregistre le compte rendu envoyé avec la fin de l’intervention', async () => {
      const id = await creerIntervention({
        statut: 'EN_COURS',
        idTournee: await creerTournee(fixtures.kevin),
        ordreTournee: 1,
        debutPrevu: a('08:00'),
        demarreeLe: a('08:05'),
      });

      const reponse = await en(fixtures.kevin.compte)
        .post(`/interventions/${id}/complete`)
        .send({ compteRendu: 'Fuite réparée.' })
        .expect(200);

      expect(reponse.body.compteRendu).toBe('Fuite réparée.');
    });
  });

  describe('transitions interdites (400)', () => {
    it('US17 : démarrer une intervention à planifier', async () => {
      const id = await creerIntervention();

      const reponse = await en(fixtures.kevin.compte)
        .post(`/interventions/${id}/start`)
        .expect(400);

      expect(reponse.body.message).toBe('Impossible de démarrer une intervention à planifier.');
    });

    it('terminer une intervention planifiée', async () => {
      const id = await planifiee(await creerTournee(fixtures.kevin), 1, '10:00');

      await en(fixtures.kevin.compte).post(`/interventions/${id}/complete`).expect(400);
    });

    it('annuler une intervention terminée', async () => {
      const id = await creerIntervention({
        statut: 'TERMINEE',
        idTournee: await creerTournee(fixtures.kevin),
        ordreTournee: 1,
        debutPrevu: a('07:00'),
      });

      const reponse = await en(fixtures.gestionnaire)
        .post(`/interventions/${id}/cancel`)
        .send({ motif: 'Erreur de saisie' })
        .expect(400);

      expect(reponse.body.message).toBe('Impossible d’annuler une intervention terminée.');
    });

    it('modifier une intervention annulée', async () => {
      const id = await creerIntervention();
      await en(fixtures.gestionnaire)
        .post(`/interventions/${id}/cancel`)
        .send({ motif: 'Doublon' })
        .expect(200);

      await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ description: 'Nouvelle description' })
        .expect(400);
    });

    it('compléter le compte rendu d’une intervention en cours', async () => {
      const id = await creerIntervention({
        statut: 'EN_COURS',
        idTournee: await creerTournee(fixtures.kevin),
        ordreTournee: 1,
        debutPrevu: a('08:00'),
      });

      await en(fixtures.kevin.compte)
        .patch(`/interventions/${id}/report`)
        .send({ compteRendu: 'Trop tôt' })
        .expect(400);
    });

    it('n’écrit rien et ne journalise rien quand la transition est refusée', async () => {
      const id = await creerIntervention();

      await en(fixtures.kevin.compte).post(`/interventions/${id}/start`).expect(400);

      const inchangee = await application.prisma.intervention.findUniqueOrThrow({ where: { id } });
      expect(inchangee).toMatchObject({ statut: 'A_PLANIFIER', demarreeLe: null });
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });
  });

  describe('droits sur les changements de statut (RG03, cahier des charges 5.5)', () => {
    it('répond 403 au technicien qui démarre l’intervention d’un collègue', async () => {
      const id = await planifiee(await creerTournee(fixtures.mathieu), 1, '10:00');

      await en(fixtures.kevin.compte).post(`/interventions/${id}/start`).expect(403);

      expect(journal.enregistrer).not.toHaveBeenCalled();
    });

    it.each([
      ['un gestionnaire', 'start', () => fixtures.gestionnaire],
      ['un administrateur', 'start', () => fixtures.admin],
      ['un gestionnaire', 'complete', () => fixtures.gestionnaire],
    ])('répond 403 à %s qui appelle %s', async (_cas, action, utilisateur) => {
      const id = await planifiee(await creerTournee(fixtures.kevin), 1, '10:00');

      await en(utilisateur()).post(`/interventions/${id}/${action}`).expect(403);
    });

    it('répond 403 au technicien qui veut annuler ou modifier', async () => {
      const id = await planifiee(await creerTournee(fixtures.kevin), 1, '10:00');

      await en(fixtures.kevin.compte)
        .post(`/interventions/${id}/cancel`)
        .send({ motif: 'Client absent' })
        .expect(403);
      await en(fixtures.kevin.compte)
        .patch(`/interventions/${id}`)
        .send({ description: 'Autre' })
        .expect(403);
    });

    it('répond 403 au collègue qui complète le compte rendu', async () => {
      const id = await creerIntervention({
        statut: 'TERMINEE',
        idTournee: await creerTournee(fixtures.kevin),
        ordreTournee: 1,
        debutPrevu: a('07:00'),
      });

      await en(fixtures.mathieu.compte)
        .patch(`/interventions/${id}/report`)
        .send({ compteRendu: 'Pas le mien' })
        .expect(403);
    });

    it('répond 401 sans utilisateur', async () => {
      await en().post('/interventions/1/start').expect(401);
    });
  });

  describe('RG24 : démarrage le jour de la tournée', () => {
    it('refuse en 400 de démarrer une intervention de la tournée de demain', async () => {
      const id = await planifiee(await creerTournee(fixtures.kevin, MARDI), 1, '10:00', MARDI);

      const reponse = await en(fixtures.kevin.compte)
        .post(`/interventions/${id}/start`)
        .expect(400);

      expect(reponse.body.message).toBe(
        `Cette intervention est prévue le ${MARDI} : elle ne peut être démarrée que ce jour-là.`,
      );
    });
  });

  describe('POST /interventions/:id/cancel : annuler (US16, RG05)', () => {
    it('retire la 2ᵉ intervention sur 3 de sa tournée : la 3ᵉ passe au rang 2', async () => {
      const idTournee = await creerTournee(fixtures.kevin);
      const premiere = await planifiee(idTournee, 1, '08:00');
      const deuxieme = await planifiee(idTournee, 2, '10:00');
      const troisieme = await planifiee(idTournee, 3, '14:00');

      const reponse = await en(fixtures.gestionnaire)
        .post(`/interventions/${deuxieme}/cancel`)
        .send({ motif: '  Le client a réparé lui-même  ' })
        .expect(200);

      expect(reponse.body).toMatchObject({
        statut: 'ANNULEE',
        motifAnnulation: 'Le client a réparé lui-même',
        annuleeLe: MAINTENANT.toISOString(),
        tournee: null,
        ordreTournee: null,
        debutPrevu: null,
        finPrevue: null,
      });
      expect(await rangsDeLaTournee(idTournee)).toEqual([
        [premiere, 1],
        [troisieme, 2],
      ]);
    });

    it('annule une intervention en cours : demarreeLe est gardé, annuleeLe et le motif renseignés, journal INTERVENTION_ANNULEE', async () => {
      const idTournee = await creerTournee(fixtures.kevin);
      const id = await creerIntervention({
        statut: 'EN_COURS',
        idTournee,
        ordreTournee: 1,
        debutPrevu: a('08:00'),
        demarreeLe: a('08:05'),
      });

      await en(fixtures.gestionnaire)
        .post(`/interventions/${id}/cancel`)
        .send({ motif: 'Pièce introuvable' })
        .expect(200);

      const annulee = await application.prisma.intervention.findUniqueOrThrow({ where: { id } });
      expect(annulee).toMatchObject({
        statut: 'ANNULEE',
        demarreeLe: new Date(a('08:05')),
        annuleeLe: MAINTENANT,
        motifAnnulation: 'Pièce introuvable',
        idTournee: null,
        termineeLe: null,
      });
      expect(journal.enregistrer).toHaveBeenCalledExactlyOnceWith({
        type: 'INTERVENTION_ANNULEE',
        auteur: { id: fixtures.gestionnaire.id, role: 'GESTIONNAIRE' },
        interventionId: id,
        ancienStatut: 'EN_COURS',
        motif: 'Pièce introuvable',
      });
    });

    it('libère le créneau : une autre intervention peut y être affectée', async () => {
      const idTournee = await creerTournee(fixtures.kevin);
      const annulee = await planifiee(idTournee, 1, '10:00');
      const remplacante = await creerIntervention();
      await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: remplacante, debutPrevu: a('10:00') })
        .expect(409);

      await en(fixtures.gestionnaire)
        .post(`/interventions/${annulee}/cancel`)
        .send({ motif: 'Client absent' })
        .expect(200);
      await en(fixtures.gestionnaire)
        .post(`/tours/${idTournee}/interventions`)
        .send({ interventionId: remplacante, debutPrevu: a('10:00') })
        .expect(200);

      expect(await rangsDeLaTournee(idTournee)).toEqual([[remplacante, 1]]);
    });

    it.each([
      ['sans motif', {}],
      ['avec un motif fait d’espaces', { motif: '   ' }],
      ['avec un motif de 501 caractères', { motif: 'a'.repeat(501) }],
      ['avec un caractère NUL (400 et non 500)', { motif: 'Client\u0000absent' }],
    ])('refuse en 400 une annulation %s, sans rien changer', async (_cas, corps) => {
      const id = await creerIntervention();

      await en(fixtures.gestionnaire).post(`/interventions/${id}/cancel`).send(corps).expect(400);

      const inchangee = await application.prisma.intervention.findUniqueOrThrow({ where: { id } });
      expect(inchangee.statut).toBe('A_PLANIFIER');
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });

    it('répond 404 pour une intervention inexistante', async () => {
      await en(fixtures.gestionnaire)
        .post('/interventions/999/cancel')
        .send({ motif: 'Erreur' })
        .expect(404);
    });
  });

  describe('PATCH /interventions/:id : modifier (US16)', () => {
    it('modifie la description et l’urgence d’une intervention planifiée, sans toucher au créneau', async () => {
      const idTournee = await creerTournee(fixtures.kevin);
      const id = await planifiee(idTournee, 1, '10:00');

      const reponse = await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ description: 'Fuite et robinet', urgence: 'URGENTE' })
        .expect(200);

      expect(reponse.body).toMatchObject({
        description: 'Fuite et robinet',
        urgence: 'URGENTE',
        statut: 'PLANIFIEE',
        ordreTournee: 1,
        debutPrevu: new Date(a('10:00')).toISOString(),
      });
    });

    it('RG09 : refuse en 409 une durée allongée qui chevauche l’intervention suivante, sans rien modifier', async () => {
      const idTournee = await creerTournee(fixtures.kevin);
      const id = await planifiee(idTournee, 1, '10:00');
      const suivante = await planifiee(idTournee, 2, '11:00');

      const reponse = await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ dureeEstimeeMin: 90 })
        .expect(409);

      expect(reponse.body.message).toContain(`n° ${suivante}`);
      const inchangee = await application.prisma.intervention.findUniqueOrThrow({ where: { id } });
      expect(inchangee.dureeEstimeeMin).toBe(60);
    });

    it('accepte une durée allongée jusqu’au début de l’intervention suivante', async () => {
      const idTournee = await creerTournee(fixtures.kevin);
      const id = await planifiee(idTournee, 1, '10:00');
      await planifiee(idTournee, 2, '11:30');

      const reponse = await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ dureeEstimeeMin: 90 })
        .expect(200);

      expect(reponse.body.finPrevue).toBe(new Date(a('11:30')).toISOString());
    });

    it('RG10 : refuse en 409 une durée allongée qui tombe sur une indisponibilité', async () => {
      const idTournee = await creerTournee(fixtures.kevin);
      const id = await planifiee(idTournee, 1, '10:00');
      await application.prisma.indisponibilite.create({
        data: {
          idTechnicien: fixtures.kevin.idTechnicien,
          debut: new Date(a('11:00')),
          fin: new Date(a('12:00')),
          motif: 'Médecin',
        },
      });

      await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ dureeEstimeeMin: 90 })
        .expect(409);
    });

    it('RG11 : refuse en 400 une durée allongée qui finit après 19 h', async () => {
      const id = await planifiee(await creerTournee(fixtures.kevin), 1, '18:00');

      await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ dureeEstimeeMin: 90 })
        .expect(400);
    });

    it('refuse en 400 de changer l’adresse d’une intervention planifiée', async () => {
      const id = await planifiee(await creerTournee(fixtures.kevin), 1, '10:00');

      await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ adresseId: fixtures.idAdresseHotel })
        .expect(400);
    });

    it('change l’adresse d’une intervention à planifier, et donc son client', async () => {
      const id = await creerIntervention();

      const reponse = await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ adresseId: fixtures.idAdresseHotel })
        .expect(200);

      expect(reponse.body.client).toMatchObject({
        id: fixtures.idClientHotel,
        nomAffiche: 'Hôtel des Lilas',
      });
    });

    it('refuse en 400 une modification vide ou un statut envoyé', async () => {
      const id = await creerIntervention();

      await en(fixtures.gestionnaire).patch(`/interventions/${id}`).send({}).expect(400);
      await en(fixtures.gestionnaire)
        .patch(`/interventions/${id}`)
        .send({ statut: 'TERMINEE' })
        .expect(400);
    });
  });

  describe('concurrence', () => {
    it('annulation et retrait simultanés de la même intervention : une seule transition part de « planifiée », les rangs restent uniques et continus', async () => {
      // Plusieurs essais : l'entrelacement qui laisserait passer les deux ne se produit pas à chaque fois.
      for (let essai = 0; essai < 10; essai += 1) {
        await application.prisma.$executeRaw`
          TRUNCATE TABLE signature_intervention, intervention, tournee RESTART IDENTITY`;
        const idTournee = await creerTournee(fixtures.kevin);
        const premiere = await planifiee(idTournee, 1, '08:00');
        const deuxieme = await planifiee(idTournee, 2, '10:00');
        const troisieme = await planifiee(idTournee, 3, '14:00');

        const [annulation, retrait] = await Promise.all([
          en(fixtures.gestionnaire)
            .post(`/interventions/${deuxieme}/cancel`)
            .send({ motif: 'Client absent' }),
          en(fixtures.gestionnaire).delete(`/tours/${idTournee}/interventions/${deuxieme}`),
        ]);

        // Deux déroulements sont corrects : l'un des deux est refusé (404 ou 409), ou le retrait
        // passe entièrement avant l'annulation, qui annule alors une intervention à planifier.
        for (const reponse of [annulation, retrait]) {
          expect(reponse.status).toBeOneOf([200, 404, 409]);
        }
        expect([annulation.status, retrait.status]).toContain(200);
        expect(await rangsDeLaTournee(idTournee)).toEqual([
          [premiere, 1],
          [troisieme, 2],
        ]);
        const sortie = await application.prisma.intervention.findUniqueOrThrow({
          where: { id: deuxieme },
        });
        expect(sortie.statut).toBe(annulation.status === 200 ? 'ANNULEE' : 'A_PLANIFIER');
        // Une seule transition peut partir de « planifiée » : sans verrou, l'annulation et le
        // retrait lisent tous deux PLANIFIEE et le journal l'enregistre deux fois.
        const departsDePlanifiee = journal.enregistrer.mock.calls.filter(
          ([action]) => action.interventionId === deuxieme && action.ancienStatut === 'PLANIFIEE',
        );
        expect(departsDePlanifiee).toHaveLength(1);
        journal.enregistrer.mockClear();
      }
    });

    it('archivage d’une adresse et création simultanés : jamais d’intervention active sur une adresse archivée', async () => {
      const { prisma } = application;
      const client = await prisma.client.create({
        data: { typeClient: 'PARTICULIER', nomClient: 'Concurrence', telephone: '0262000009' },
      });
      // Plusieurs essais : l'entrelacement qui laisserait passer les deux ne se produit pas à chaque fois.
      for (let essai = 0; essai < 10; essai += 1) {
        await prisma.adresse.create({
          data: {
            rue: 'Adresse gardée',
            codePostal: '97400',
            ville: 'Saint-Denis',
            idClient: client.id,
          },
        });
        const adresse = await prisma.adresse.create({
          data: {
            rue: 'Adresse archivée',
            codePostal: '97400',
            ville: 'Saint-Denis',
            idClient: client.id,
          },
        });

        const [archivage, creation] = await Promise.all([
          en(fixtures.gestionnaire).post(`/clients/${client.id}/addresses/${adresse.id}/archive`),
          en(fixtures.gestionnaire).post('/interventions').send({
            adresseId: adresse.id,
            typeInterventionId: fixtures.idType,
            description: 'Fuite',
            urgence: 'NORMALE',
          }),
        ]);

        expect([archivage.status, creation.status]).toBeOneOf([
          [200, 400],
          [409, 201],
        ]);
        const surAdresseArchivee = await prisma.intervention.count({
          where: { adresse: { archive: true, idClient: client.id }, statut: 'A_PLANIFIER' },
        });
        expect(surAdresseArchivee).toBe(0);
      }
      await prisma.intervention.deleteMany({ where: { adresse: { idClient: client.id } } });
      await prisma.adresse.deleteMany({ where: { idClient: client.id } });
      await prisma.client.delete({ where: { id: client.id } });
    });
  });

  describe('signature du client à la clôture (US33)', () => {
    const PNG = fabriquerPng();
    const IMAGE = enDataUrl(PNG);
    const COMPTE_RENDU = 'Joint du siphon remplacé, plus de fuite.';
    const SIGNATURE = { nomSignataire: 'Jean Dupont', image: IMAGE };
    const CORPS_SIGNE = { compteRendu: COMPTE_RENDU, signature: SIGNATURE };

    /** Intervention en cours dans la tournée du jour du technicien. */
    async function enCours(technicien = fixtures.kevin): Promise<number> {
      return creerIntervention({
        statut: 'EN_COURS',
        idTournee: await creerTournee(technicien),
        ordreTournee: 1,
        debutPrevu: a('08:00'),
        demarreeLe: a('08:05'),
      });
    }

    function terminer(id: number, corps: object, utilisateur = fixtures.kevin.compte) {
      return en(utilisateur).post(`/interventions/${id}/complete`).send(corps);
    }

    /** Intervention terminée et signée par l'API, comme sur le terrain. */
    async function signee(): Promise<number> {
      const id = await enCours();
      await terminer(id, CORPS_SIGNE).expect(200);
      journal.enregistrer.mockClear();
      return id;
    }

    /**
     * Intervention au statut voulu, dans la tournée de Kévin quand le statut l'exige. Une
     * intervention annulée l'est par l'API, qui renseigne le motif obligatoire (RG05).
     */
    async function interventionAuStatut(statut: StatutIntervention): Promise<number> {
      if (statut === 'A_PLANIFIER' || statut === 'ANNULEE') {
        const id = await creerIntervention();
        if (statut === 'ANNULEE') {
          await en(fixtures.gestionnaire)
            .post(`/interventions/${id}/cancel`)
            .send({ motif: 'Client absent' })
            .expect(200);
          journal.enregistrer.mockClear();
        }
        return id;
      }
      return creerIntervention({
        statut,
        idTournee: await creerTournee(fixtures.kevin),
        ordreTournee: 1,
        debutPrevu: a('08:00'),
      });
    }

    function signaturesEnBase() {
      return application.prisma.signatureIntervention.findMany();
    }

    /** Aucune trace d'une clôture refusée : ni signature, ni changement, ni journal. */
    async function verifierRienDEcrit(id: number): Promise<void> {
      expect(await signaturesEnBase()).toEqual([]);
      const intervention = await application.prisma.intervention.findUniqueOrThrow({
        where: { id },
      });
      expect(intervention).toMatchObject({ statut: 'EN_COURS', termineeLe: null });
      expect(journal.enregistrer).not.toHaveBeenCalled();
    }

    describe('POST /interventions/:id/complete avec signature', () => {
      it('termine l’intervention et enregistre la signature à l’heure de la clôture', async () => {
        const id = await enCours();

        const reponse = await terminer(id, CORPS_SIGNE).expect(200);

        expect(reponse.body).toMatchObject({
          statut: 'TERMINEE',
          compteRendu: COMPTE_RENDU,
          termineeLe: MAINTENANT.toISOString(),
          signature: { nomSignataire: 'Jean Dupont', signeeLe: MAINTENANT.toISOString() },
        });
        expect(reponse.body.signature.signeeLe).toBe(reponse.body.termineeLe);
        const lignes = await signaturesEnBase();
        expect(lignes).toHaveLength(1);
        expect(lignes[0]).toMatchObject({
          idIntervention: id,
          nomSignataire: 'Jean Dupont',
          signeeLe: MAINTENANT,
          idAuteur: fixtures.kevin.compte.id,
        });
        expect(lignes[0].empreinte).toMatch(/^[0-9a-f]{64}$/);
        expect(Buffer.compare(Buffer.from(lignes[0].image), PNG)).toBe(0);
      });

      it('journalise STATUT_MODIFIE puis SIGNATURE_ENREGISTREE, sans image ni nom', async () => {
        const id = await enCours();

        await terminer(id, CORPS_SIGNE).expect(200);

        const [{ empreinte }] = await signaturesEnBase();
        const actions = journal.enregistrer.mock.calls.map(([action]) => action);
        expect(actions).toEqual([
          {
            type: 'STATUT_MODIFIE',
            auteur: { id: fixtures.kevin.compte.id, role: 'TECHNICIEN' },
            interventionId: id,
            ancienStatut: 'EN_COURS',
            nouveauStatut: 'TERMINEE',
          },
          {
            type: 'SIGNATURE_ENREGISTREE',
            auteur: { id: fixtures.kevin.compte.id, role: 'TECHNICIEN' },
            interventionId: id,
            empreinte,
          },
        ]);
        const texte = JSON.stringify(actions);
        expect(texte).not.toContain('Jean Dupont');
        expect(texte).not.toContain(PNG.toString('base64').slice(0, 40));
      });

      it('sans signature, termine comme avant, avec signature à null', async () => {
        const id = await enCours();

        const reponse = await terminer(id, { compteRendu: 'Fuite réparée.' }).expect(200);

        expect(reponse.body).toMatchObject({ statut: 'TERMINEE', signature: null });
        expect(await signaturesEnBase()).toEqual([]);
        expect(journal.enregistrer).toHaveBeenCalledTimes(1);
      });

      it.each<[string, StatutIntervention, string]>([
        ['à planifier', 'A_PLANIFIER', 'Impossible de terminer une intervention à planifier.'],
        ['planifiée', 'PLANIFIEE', 'Impossible de terminer une intervention planifiée.'],
        ['annulée', 'ANNULEE', 'Impossible de terminer une intervention annulée.'],
        ['déjà terminée', 'TERMINEE', 'Impossible de terminer une intervention terminée.'],
      ])(
        'refuse en 400 une signature sur une intervention %s',
        async (_libelle, statut, message) => {
          const id = await interventionAuStatut(statut);

          const reponse = await terminer(id, CORPS_SIGNE).expect(400);

          expect(reponse.body.message).toBe(message);
          expect(await signaturesEnBase()).toEqual([]);
          expect(journal.enregistrer).not.toHaveBeenCalled();
        },
      );

      it.each([
        ['un technicien collègue', () => fixtures.mathieu.compte],
        ['un gestionnaire', () => fixtures.gestionnaire],
      ])('répond 403 à %s qui fait signer, sans rien écrire', async (_cas, utilisateur) => {
        const id = await enCours();

        await terminer(id, CORPS_SIGNE, utilisateur()).expect(403);

        await verifierRienDEcrit(id);
      });

      it('RG32 : une deuxième clôture signée est refusée et la première signature reste', async () => {
        const id = await signee();
        const [avant] = await signaturesEnBase();

        await terminer(id, {
          compteRendu: 'Autre texte',
          signature: {
            nomSignataire: 'Quelqu’un d’autre',
            image: enDataUrl(fabriquerPng({ largeur: 400 })),
          },
        }).expect(400);

        expect(await signaturesEnBase()).toEqual([avant]);
        const intervention = await application.prisma.intervention.findUniqueOrThrow({
          where: { id },
        });
        expect(intervention.compteRendu).toBe(COMPTE_RENDU);
        expect(journal.enregistrer).not.toHaveBeenCalled();
      });

      it('RG31 : refuse une signature sans compte rendu, sans rien écrire', async () => {
        const id = await enCours();

        const reponse = await terminer(id, { signature: SIGNATURE }).expect(400);

        expect(reponse.body.message).toEqual(['compteRendu est obligatoire']);
        await verifierRienDEcrit(id);
      });

      it('refuse une signature à null, sans rien écrire', async () => {
        const id = await enCours();

        const reponse = await terminer(id, { compteRendu: 'Ok', signature: null }).expect(400);

        expect(reponse.body.message).toEqual(['signature ne peut pas être null']);
        await verifierRienDEcrit(id);
      });

      it.each([
        [
          'une image JPEG',
          enDataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'data:image/jpeg;base64,'),
        ],
        [
          'une image SVG',
          enDataUrl(
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
            'data:image/svg+xml;base64,',
          ),
        ],
        [
          'un texte en base64 annoncé comme PNG',
          enDataUrl(Buffer.from('<html><body>Ceci n’est pas une image</body></html>')),
        ],
      ])('refuse %s en 400, sans rien écrire (revue de sécurité)', async (_cas, image) => {
        const id = await enCours();

        const reponse = await terminer(id, {
          compteRendu: COMPTE_RENDU,
          signature: { nomSignataire: 'Jean Dupont', image },
        }).expect(400);

        expect(reponse.body.message).toEqual(['La signature doit être une image PNG valide.']);
        await verifierRienDEcrit(id);
      });

      it('refuse en 400 une image de 49 153 octets, sans rien écrire', async () => {
        const id = await enCours();

        const reponse = await terminer(id, {
          compteRendu: COMPTE_RENDU,
          signature: {
            nomSignataire: 'Jean Dupont',
            image: enDataUrl(fabriquerPng({ taille: 49_153 })),
          },
        }).expect(400);

        expect(reponse.body.message).toEqual(['La signature dépasse 48 Ko.']);
        await verifierRienDEcrit(id);
      });

      it('accepte une image de 49 152 octets et un compte rendu de 2 000 caractères', async () => {
        const id = await enCours();

        await terminer(id, {
          compteRendu: 'é'.repeat(2000),
          signature: {
            nomSignataire: 'Jean Dupont',
            image: enDataUrl(fabriquerPng({ taille: 49_152 })),
          },
        }).expect(200);

        const [ligne] = await signaturesEnBase();
        expect(ligne.image).toHaveLength(49_152);
      });

      it('répond 413 à un corps de plus de 100 Ko, sans rien écrire', async () => {
        const id = await enCours();

        await terminer(id, {
          compteRendu: COMPTE_RENDU,
          signature: {
            nomSignataire: 'Jean Dupont',
            image: `data:image/png;base64,${'A'.repeat(110_000)}`,
          },
        }).expect(413);

        await verifierRienDEcrit(id);
      });
    });

    describe('GET /interventions/:id/signature', () => {
      it.each([
        ['au gestionnaire', () => fixtures.gestionnaire],
        ['à l’administrateur', () => fixtures.admin],
        ['au technicien de la tournée', () => fixtures.kevin.compte],
      ])('renvoie la signature intacte %s', async (_cas, utilisateur) => {
        const id = await signee();
        const [{ empreinte }] = await signaturesEnBase();

        const reponse = await en(utilisateur()).get(`/interventions/${id}/signature`).expect(200);

        expect(reponse.body).toEqual({
          nomSignataire: 'Jean Dupont',
          signeeLe: MAINTENANT.toISOString(),
          auteur: { id: fixtures.kevin.compte.id, nom: 'Hoarau', prenom: 'Kévin' },
          empreinte,
          integre: true,
          image: IMAGE,
        });
      });

      it('répond 403 au technicien collègue, même pour une intervention non signée', async () => {
        const signeeParKevin = await signee();
        const { idTournee } = await application.prisma.intervention.findUniqueOrThrow({
          where: { id: signeeParKevin },
        });
        const nonSignee = await creerIntervention({
          statut: 'EN_COURS',
          idTournee: idTournee ?? undefined,
          ordreTournee: 2,
          debutPrevu: a('10:00'),
        });

        await en(fixtures.mathieu.compte)
          .get(`/interventions/${signeeParKevin}/signature`)
          .expect(403);
        await en(fixtures.mathieu.compte).get(`/interventions/${nonSignee}/signature`).expect(403);
      });

      it('répond 404 pour une intervention terminée sans signature', async () => {
        const id = await enCours();
        await terminer(id, {}).expect(200);

        const reponse = await en(fixtures.gestionnaire)
          .get(`/interventions/${id}/signature`)
          .expect(404);

        expect(reponse.body.message).toBe('Cette intervention n’a pas été signée.');
      });

      it('répond 404 pour une intervention inexistante', async () => {
        const reponse = await en(fixtures.gestionnaire)
          .get('/interventions/9999/signature')
          .expect(404);

        expect(reponse.body.message).toBe('Intervention introuvable.');
      });

      it('reste intègre avec des accents et un emoji, relus depuis PostgreSQL', async () => {
        const id = await enCours();
        await terminer(id, {
          compteRendu: 'Siphon changé, client ravi 😀',
          signature: { nomSignataire: 'Jérôme Hoarau-Técher', image: IMAGE },
        }).expect(200);

        const reponse = await en(fixtures.gestionnaire)
          .get(`/interventions/${id}/signature`)
          .expect(200);

        expect(reponse.body).toMatchObject({
          nomSignataire: 'Jérôme Hoarau-Técher',
          integre: true,
        });
      });

      it('refuse en 400 une moitié d’emoji, qui rendrait la signature non intègre', async () => {
        const id = await enCours();

        const reponse = await terminer(id, {
          compteRendu: 'Fuite réparée \ud83d',
          signature: SIGNATURE,
        }).expect(400);

        expect(reponse.body.message).toEqual(['compteRendu contient un caractère non autorisé']);
        await verifierRienDEcrit(id);
      });

      it('RG34 : signale un compte rendu modifié en SQL direct, hors de l’API', async () => {
        const id = await signee();
        await application.prisma.$executeRaw`
          UPDATE intervention SET compte_rendu = 'Texte réécrit' WHERE id_intervention = ${id}`;

        const reponse = await en(fixtures.gestionnaire)
          .get(`/interventions/${id}/signature`)
          .expect(200);

        expect(reponse.body.integre).toBe(false);
      });
    });

    describe('signature définitive (RG32, RG33)', () => {
      it('refuse en 400 de modifier le compte rendu d’une intervention signée', async () => {
        const id = await signee();

        const reponse = await en(fixtures.kevin.compte)
          .patch(`/interventions/${id}/report`)
          .send({ compteRendu: 'Autre texte' })
          .expect(400);

        expect(reponse.body.message).toBe(
          'Le compte rendu d’une intervention signée ne se modifie plus.',
        );
        const intervention = await application.prisma.intervention.findUniqueOrThrow({
          where: { id },
        });
        expect(intervention.compteRendu).toBe(COMPTE_RENDU);
      });

      it('US18 inchangée : le compte rendu d’une intervention terminée sans signature se modifie', async () => {
        const id = await enCours();
        await terminer(id, { compteRendu: 'Premier texte' }).expect(200);

        await en(fixtures.kevin.compte)
          .patch(`/interventions/${id}/report`)
          .send({ compteRendu: 'Texte complété' })
          .expect(200);
      });

      it('le déclencheur refuse toute mise à jour de la signature en SQL direct', async () => {
        const id = await signee();

        await expect(
          application.prisma.$executeRaw`
            UPDATE signature_intervention SET nom_signataire = 'Autre' WHERE id_intervention = ${id}`,
        ).rejects.toThrow(/une signature est définitive/);
        const [ligne] = await signaturesEnBase();
        expect(ligne.nomSignataire).toBe('Jean Dupont');
      });

      it('la suppression reste possible, pour l’anonymisation RGPD', async () => {
        const id = await signee();

        await application.prisma.$executeRaw`
          DELETE FROM signature_intervention WHERE id_intervention = ${id}`;

        expect(await signaturesEnBase()).toEqual([]);
      });
    });

    describe('résumé dans l’objet Intervention, jamais l’image', () => {
      const RESUME = { nomSignataire: 'Jean Dupont', signeeLe: MAINTENANT.toISOString() };
      const DEBUT_DE_L_IMAGE = PNG.toString('base64').slice(0, 40);

      it('GET /interventions renvoie le résumé de la signature, ou null', async () => {
        const id = await signee();
        const autre = await creerIntervention();

        const reponse = await en(fixtures.gestionnaire).get('/interventions').expect(200);

        const signatures = Object.fromEntries(
          reponse.body.data.map((intervention: { id: number; signature: unknown }) => [
            intervention.id,
            intervention.signature,
          ]),
        );
        expect(signatures).toEqual({ [id]: RESUME, [autre]: null });
        expect(reponse.text).not.toContain(DEBUT_DE_L_IMAGE);
        expect(reponse.text).not.toContain('"image"');
      });

      it('GET /tours/me/today renvoie le résumé de la signature à son technicien', async () => {
        const id = await signee();

        const reponse = await en(fixtures.kevin.compte).get('/tours/me/today').expect(200);

        expect(reponse.body.interventions).toEqual([
          expect.objectContaining({ id, signature: RESUME }),
        ]);
        expect(reponse.text).not.toContain(DEBUT_DE_L_IMAGE);
        expect(reponse.text).not.toContain('"image"');
      });
    });
  });
});

async function creerFixtures({ prisma }: ApplicationDeTest): Promise<Fixtures> {
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
  const creerTechnicien = async (email: string, nom: string, prenom: string, couleur: string) => {
    const compte = await creerCompte(prisma, { email, nom, prenom, role: 'TECHNICIEN' });
    const fiche = await prisma.technicien.create({
      data: { telephone: '0692000001', couleurPlanning: couleur, idUtilisateur: compte.id },
    });
    return { idTechnicien: fiche.id, compte };
  };
  const kevin = await creerTechnicien('kevin@test.re', 'Hoarau', 'Kévin', '#0F766E');
  const mathieu = await creerTechnicien('mathieu@test.re', 'Rivière', 'Mathieu', '#1E88E5');
  const type = await prisma.typeIntervention.create({
    data: { libelle: 'Fuite', dureeDefautMin: 45 },
  });
  const ADRESSE = { rue: '12 rue des Lilas', codePostal: '97400', ville: 'Saint-Denis' };
  const helene = await prisma.client.create({
    data: {
      typeClient: 'PARTICULIER',
      nomClient: 'Grondin',
      prenomClient: 'Hélène',
      telephone: '0262000001',
      adresses: { create: [ADRESSE, { ...ADRESSE, rue: '3 rue Juliette Dodu', archive: true }] },
    },
    include: { adresses: { orderBy: { id: 'asc' } } },
  });
  const hotel = await prisma.client.create({
    data: {
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Hôtel des Lilas',
      telephone: '0262000002',
      adresses: { create: [{ ...ADRESSE, rue: '1 boulevard de l’Océan' }] },
    },
    include: { adresses: true },
  });
  const archive = await prisma.client.create({
    data: {
      typeClient: 'PARTICULIER',
      nomClient: 'Ancien',
      telephone: '0262000003',
      archive: true,
      adresses: { create: [ADRESSE] },
    },
    include: { adresses: true },
  });
  return {
    admin,
    gestionnaire,
    kevin,
    mathieu,
    idType: type.id,
    idAdresseHelene: helene.adresses[0].id,
    idClientHelene: helene.id,
    idAdresseArchivee: helene.adresses[1].id,
    idAdresseHotel: hotel.adresses[0].id,
    idClientHotel: hotel.id,
    idAdresseDuClientArchive: archive.adresses[0].id,
  };
}
