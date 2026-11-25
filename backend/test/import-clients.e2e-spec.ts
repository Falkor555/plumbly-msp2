import { Logger } from '@nestjs/common';
import { Client as ClientPostgres } from 'pg';
import { CLE_DU_VERROU_D_IMPORT } from '../src/clients/import/import-clients.repository.js';
import type { UtilisateurConnecte } from '../src/commun/autorisation/utilisateur-connecte.js';
import { type ActionJournalisee, JournalDesActions } from '../src/journal/journal-des-actions.js';
import {
  type ApplicationDeTest,
  creerCompte,
  demarrerApplication,
  requetesEn,
  viderLaBase,
} from './support/application-de-test.js';

/*
 * Tests d'intégration de l'import des clients (US31, issue #47) : routes HTTP, lecture du corps,
 * transaction unique (RG29), verrou consultatif, doublons (RG28) et journal (RG25), sur la base
 * éphémère de Testcontainers.
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');

const EN_TETE = 'nom;prenom;email;telephone;adresse;code_postal;ville';
const DUPONT =
  'DUPONT;Marie;marie.dupont@exemple.re;0692 12 34 56;12 rue des Manguiers;97400;Saint-Denis';
const HOARAU =
  'HOARAU;Jean;jean.hoarau@exemple.re;0692 98 76 54;8 avenue de la Victoire;97410;Saint-Pierre';

function fichier(...lignes: string[]): string {
  return [EN_TETE, ...lignes].join('\r\n');
}

/** Ligne d'un nouveau client numéroté, au téléphone unique. */
function ligneNumero(rang: number): string {
  return `Client${rang};;;06${String(rang).padStart(8, '0')};${rang} rue des Lilas;97400;Saint-Denis`;
}

interface Fixtures {
  admin: UtilisateurConnecte;
  gestionnaire: UtilisateurConnecte;
  technicien: UtilisateurConnecte;
}

describe('import des clients (e2e)', () => {
  let application: ApplicationDeTest;
  let fixtures: Fixtures;
  let journal: { enregistrer: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    application = await demarrerApplication(MAINTENANT);
    const { prisma } = application;
    fixtures = {
      admin: await creerCompte(prisma, {
        email: 'admin@test.re',
        nom: 'Bidel',
        prenom: 'Arnaud',
        role: 'ADMIN',
      }),
      gestionnaire: await creerCompte(prisma, {
        email: 'gestion@test.re',
        nom: 'Payet',
        prenom: 'Céline',
        role: 'GESTIONNAIRE',
      }),
      technicien: await creerCompte(prisma, {
        email: 'kevin@test.re',
        nom: 'Hoarau',
        prenom: 'Kévin',
        role: 'TECHNICIEN',
      }),
    };
    const simule = application.app.get(JournalDesActions);
    journal = { enregistrer: vi.spyOn(simule, 'enregistrer') as ReturnType<typeof vi.fn> };
  });

  beforeEach(async () => {
    journal.enregistrer.mockClear();
    await application.prisma.$executeRaw`
      TRUNCATE TABLE signature_intervention, intervention, tournee, adresse, client RESTART IDENTITY`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // restoreAllMocks retire aussi l'espion du journal : il est remis pour le test suivant.
    const simule = application.app.get(JournalDesActions);
    journal = { enregistrer: vi.spyOn(simule, 'enregistrer') as ReturnType<typeof vi.fn> };
  });

  afterAll(async () => {
    await viderLaBase(application.prisma);
    await application.app.close();
  });

  const en = (utilisateur?: UtilisateurConnecte) => requetesEn(application.app, utilisateur);
  const gestionnaire = () => en(fixtures.gestionnaire);
  const analyser = (corps: object) => gestionnaire().post('/clients/import/analysis').send(corps);
  const importer = (corps: object) => gestionnaire().post('/clients/import').send(corps);

  function actionsJournalisees(): ActionJournalisee[] {
    return journal.enregistrer.mock.calls.map(([action]) => action as ActionJournalisee);
  }

  /** Clients et adresses en base, pour comparer avant et après. */
  async function etatDesClients() {
    const { prisma } = application;
    return {
      clients: await prisma.client.findMany({ orderBy: { id: 'asc' } }),
      adresses: await prisma.adresse.findMany({ orderBy: { id: 'asc' } }),
    };
  }

  describe('POST /clients/import/analysis', () => {
    it('renvoie séparateur, en-têtes, correspondance, aperçu, résultat par ligne et totaux', async () => {
      await application.prisma.client.create({
        data: {
          typeClient: 'PARTICULIER',
          nomClient: 'Hoarau',
          telephone: '0692987654',
          adresses: { create: [{ rue: '1 rue', codePostal: '97400', ville: 'Saint-Denis' }] },
        },
      });
      const contenu = [
        'nom;prenom;Tel;adresse;code_postal;ville;remarque',
        'DUPONT;Marie;0692 12 34 56;12 rue des Manguiers;97400;Saint-Denis;',
        'HOARAU;Jean;0692 98 76 54;8 avenue de la Victoire;97410;Saint-Pierre;fidèle',
        'PAYET;Luc;0692;1 rue;97400;Saint-Denis;',
      ].join('\r\n');

      const reponse = await analyser({ contenu }).expect(200);

      expect(reponse.body).toEqual({
        separateur: ';',
        enTetes: ['nom', 'prenom', 'Tel', 'adresse', 'code_postal', 'ville', 'remarque'],
        correspondance: {
          nom: 'nomClient',
          prenom: 'prenomClient',
          Tel: 'telephone',
          adresse: 'rue',
          code_postal: 'codePostal',
          ville: 'ville',
          remarque: null,
        },
        colonnesIgnorees: ['remarque'],
        apercu: [
          {
            numero: 2,
            cellules: [
              'DUPONT',
              'Marie',
              '0692 12 34 56',
              '12 rue des Manguiers',
              '97400',
              'Saint-Denis',
              '',
            ],
          },
          {
            numero: 3,
            cellules: [
              'HOARAU',
              'Jean',
              '0692 98 76 54',
              '8 avenue de la Victoire',
              '97410',
              'Saint-Pierre',
              'fidèle',
            ],
          },
          { numero: 4, cellules: ['PAYET', 'Luc', '0692', '1 rue', '97400', 'Saint-Denis', ''] },
        ],
        lignes: [
          { numero: 2, resultat: 'VALIDE' },
          { numero: 3, resultat: 'DOUBLON', clientId: 1, motif: 'Même téléphone que le client 1' },
          {
            numero: 4,
            resultat: 'INVALIDE',
            erreurs: [
              'telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)',
            ],
          },
        ],
        totaux: { lignes: 3, valides: 1, doublons: 1, invalides: 1 },
      });
    });

    it('n’enregistre rien, ni en base ni dans le journal', async () => {
      const avant = await etatDesClients();

      await analyser({ contenu: fichier(DUPONT, HOARAU) }).expect(200);

      expect(await etatDesClients()).toEqual(avant);
      expect(actionsJournalisees()).toEqual([]);
    });

    it('applique la correspondance et le séparateur envoyés', async () => {
      const contenu =
        'nom,fixe,mobile,rue,cp,ville\nDupont,0262000000,0692123456,1 rue,97400,Saint-Denis';

      const reponse = await analyser({
        contenu,
        separateur: ',',
        correspondance: { fixe: null, mobile: 'telephone' },
      }).expect(200);

      expect(reponse.body.correspondance).toMatchObject({ fixe: null, mobile: 'telephone' });
      expect(reponse.body.lignes).toEqual([{ numero: 2, resultat: 'VALIDE' }]);
    });

    it.each([
      ['un fichier vide', { contenu: '' }, ['Le fichier est vide']],
      [
        'un fichier sans ligne de données',
        { contenu: EN_TETE },
        ['Le fichier ne contient aucune ligne de données'],
      ],
      [
        'des guillemets non fermés',
        { contenu: `${EN_TETE}\n"DUPONT;Marie` },
        ['Le fichier contient des guillemets non fermés (ligne 2)'],
      ],
      [
        'un fichier qui n’est pas en UTF-8',
        { contenu: `${EN_TETE}\nH\uFFFDl\uFFFDne` },
        ['Enregistrez le fichier au format CSV UTF-8'],
      ],
      [
        'un champ obligatoire sans colonne',
        { contenu: 'nom;telephone\nDupont;0692123456' },
        [
          'Aucune colonne pour le champ obligatoire rue',
          'Aucune colonne pour le champ obligatoire codePostal',
          'Aucune colonne pour le champ obligatoire ville',
        ],
      ],
      [
        'strategieDoublons',
        { contenu: fichier(DUPONT), strategieDoublons: 'IGNORER' },
        ['Le champ strategieDoublons n’est pas autorisé'],
      ],
    ])('refuse %s (400)', async (_cas, corps, message) => {
      const reponse = await analyser(corps).expect(400);

      expect(reponse.body).toEqual({ statusCode: 400, message, error: 'Bad Request' });
    });

    it('refuse 1 001 lignes de données (400)', async () => {
      const lignes = Array.from({ length: 1001 }, (_, rang) => ligneNumero(rang));

      const reponse = await analyser({ contenu: fichier(...lignes) }).expect(400);

      expect(reponse.body.message).toEqual(['Le fichier dépasse 1 000 lignes de données']);
    });
  });

  describe('POST /clients/import', () => {
    it('crée les clients et leur adresse, et renvoie le rapport (RG21)', async () => {
      const reponse = await importer({
        contenu: fichier(DUPONT, HOARAU),
        strategieDoublons: 'IGNORER',
      }).expect(200);

      expect(reponse.body).toEqual({
        totaux: { crees: 2, misAJour: 0, ignores: 0, rejetes: 0 },
        lignes: [
          { numero: 2, resultat: 'CREE', clientId: 1 },
          { numero: 3, resultat: 'CREE', clientId: 2 },
        ],
      });
      const clients = await application.prisma.client.findMany({
        orderBy: { id: 'asc' },
        include: { adresses: true },
      });
      expect(clients).toMatchObject([
        {
          typeClient: 'PARTICULIER',
          nomClient: 'DUPONT',
          prenomClient: 'Marie',
          telephone: '0692123456',
          emailClient: 'marie.dupont@exemple.re',
          archive: false,
          adresses: [{ rue: '12 rue des Manguiers', codePostal: '97400', ville: 'Saint-Denis' }],
        },
        { nomClient: 'HOARAU', telephone: '0692987654', adresses: [{ ville: 'Saint-Pierre' }] },
      ]);
    });

    it('journalise CLIENTS_IMPORTES avec les compteurs, sans nom, téléphone ni e-mail', async () => {
      await importer({ contenu: fichier(DUPONT, 'x;;;;;;'), strategieDoublons: 'IGNORER' }).expect(
        200,
      );

      expect(actionsJournalisees()).toEqual([
        {
          type: 'CLIENTS_IMPORTES',
          auteur: { id: fixtures.gestionnaire.id, role: 'GESTIONNAIRE' },
          strategieDoublons: 'IGNORER',
          crees: 1,
          misAJour: 0,
          ignores: 0,
          rejetes: 1,
        },
      ]);
      expect(JSON.stringify(actionsJournalisees())).not.toMatch(/DUPONT|0692|marie/);
    });

    it('enregistre les lignes valides malgré les lignes invalides (RG27)', async () => {
      const reponse = await importer({
        contenu: fichier(
          DUPONT,
          'PAYET;Luc;;0692;1 rue;97400;Saint-Denis',
          HOARAU,
          'GRONDIN;;;0692000000;1 rue;974;',
        ),
        strategieDoublons: 'IGNORER',
      }).expect(200);

      expect(reponse.body.totaux).toEqual({ crees: 2, misAJour: 0, ignores: 0, rejetes: 2 });
      expect(reponse.body.lignes[3]).toEqual({
        numero: 5,
        resultat: 'REJETE',
        erreurs: ['codePostal doit contenir 5 chiffres', 'ville est obligatoire'],
      });
      expect(await application.prisma.client.count()).toBe(2);
    });

    it('stocke telle quelle une chaîne SQL piégée dans une cellule', async () => {
      const piege = "'); DROP TABLE client; --";
      const ligne = `"${piege}";Marie;;0692123456;1 rue;97400;Saint-Denis`;

      await importer({ contenu: fichier(ligne), strategieDoublons: 'IGNORER' }).expect(200);

      const [client] = await application.prisma.client.findMany();
      expect(client.nomClient).toBe(piege);
      expect(await application.prisma.adresse.count()).toBe(1);
    });

    it(
      'importe 1 000 lignes en une transaction, bien sous la limite de 30 secondes',
      { timeout: 60_000 },
      async () => {
        const lignes = Array.from({ length: 1000 }, (_, rang) => ligneNumero(rang));
        const debut = performance.now();

        const reponse = await importer({
          contenu: fichier(...lignes),
          strategieDoublons: 'IGNORER',
        }).expect(200);

        expect(performance.now() - debut).toBeLessThan(20_000);
        expect(reponse.body.totaux.crees).toBe(1000);
        expect(await application.prisma.adresse.count()).toBe(1000);
      },
    );

    it.each([
      ['absente', {}],
      ['inconnue', { strategieDoublons: 'SIGNALER' }],
    ])('refuse une stratégie de doublons %s (400), sans rien enregistrer', async (_cas, champs) => {
      const reponse = await importer({ contenu: fichier(DUPONT), ...champs }).expect(400);

      expect(reponse.body.message).toEqual([
        'strategieDoublons doit valoir IGNORER ou METTRE_A_JOUR',
      ]);
      expect(await application.prisma.client.count()).toBe(0);
      expect(actionsJournalisees()).toEqual([]);
    });

    describe('doublons : IGNORER puis METTRE_A_JOUR sur le même fichier (RG28)', () => {
      it('ignore, puis met à jour sans rien vider, ajoute l’adresse une fois et laisse l’archivé intact', async () => {
        const { prisma } = application;
        const dupont = await prisma.client.create({
          data: {
            typeClient: 'PARTICULIER',
            nomClient: 'Dupont',
            prenomClient: 'Marie',
            telephone: '0692123456',
            emailClient: 'ancien@exemple.re',
            adresses: {
              create: [{ rue: '12 rue des Manguiers', codePostal: '97400', ville: 'Saint-Denis' }],
            },
          },
        });
        const archive = await prisma.client.create({
          data: {
            typeClient: 'PARTICULIER',
            nomClient: 'Archivé',
            telephone: '0692987654',
            archive: true,
            archiveLe: MAINTENANT,
            adresses: {
              create: [{ rue: '1 rue Ancienne', codePostal: '97400', ville: 'Saint-Denis' }],
            },
          },
        });
        const contenu = fichier(
          // Prénom vide (rien n'est vidé), e-mail nouveau, adresse nouvelle, deux fois.
          'DUPONT;;marie.dupont@exemple.re;0692123456;3 chemin Neuf;97419;La Possession',
          'DUPONT;;marie.dupont@exemple.re;0692123456;3  Chemin NEUF ;97419;la possession',
          'NOUVEAU-NOM;;;0692 98 76 54;9 rue Autre;97400;Saint-Denis',
          'GRONDIN;Hélène;;0692000001;5 rue des Lilas;97400;Saint-Denis',
        );
        const etatInitial = await etatDesClients();

        const ignore = await importer({ contenu, strategieDoublons: 'IGNORER' }).expect(200);

        expect(ignore.body.lignes.map((ligne: { resultat: string }) => ligne.resultat)).toEqual([
          'IGNORE',
          'IGNORE',
          'IGNORE',
          'CREE',
        ]);
        const apresIgnorer = await etatDesClients();
        expect(apresIgnorer.clients.slice(0, 2)).toEqual(etatInitial.clients);
        expect(apresIgnorer.adresses.slice(0, 2)).toEqual(etatInitial.adresses);

        const misAJour = await importer({ contenu, strategieDoublons: 'METTRE_A_JOUR' }).expect(
          200,
        );

        expect(misAJour.body).toEqual({
          totaux: { crees: 0, misAJour: 3, ignores: 1, rejetes: 0 },
          lignes: [
            { numero: 2, resultat: 'MIS_A_JOUR', clientId: dupont.id },
            { numero: 3, resultat: 'MIS_A_JOUR', clientId: dupont.id },
            {
              numero: 4,
              resultat: 'IGNORE',
              clientId: archive.id,
              motif: 'Client archivé : il ne sera pas mis à jour',
            },
            { numero: 5, resultat: 'MIS_A_JOUR', clientId: 3 },
          ],
        });
        const dupontApres = await prisma.client.findUniqueOrThrow({
          where: { id: dupont.id },
          include: { adresses: { orderBy: { id: 'asc' } } },
        });
        expect(dupontApres).toMatchObject({
          nomClient: 'DUPONT',
          prenomClient: 'Marie',
          emailClient: 'marie.dupont@exemple.re',
          adresses: [
            { rue: '12 rue des Manguiers', archive: false },
            { rue: '3 chemin Neuf', codePostal: '97419', ville: 'La Possession', archive: false },
          ],
        });
        const archiveApres = await prisma.client.findUniqueOrThrow({
          where: { id: archive.id },
          include: { adresses: true },
        });
        expect(archiveApres).toEqual({
          ...etatInitial.clients[1],
          adresses: [etatInitial.adresses[1]],
        });
        expect(actionsJournalisees().map((action) => action.type)).toEqual([
          'CLIENTS_IMPORTES',
          'CLIENTS_IMPORTES',
        ]);
      });
    });

    describe('aller-retour export → import (US32)', () => {
      it('reconnaît chaque ligne d’un export réimporté comme un doublon : aucune création', async () => {
        const { prisma } = application;
        await prisma.client.create({
          data: {
            typeClient: 'PARTICULIER',
            nomClient: '=Dupont',
            prenomClient: 'Marie',
            telephone: '0692123456',
            emailClient: 'marie.dupont@exemple.re',
            adresses: {
              create: [
                {
                  rue: '12 rue des Manguiers',
                  codePostal: '97400',
                  ville: 'Saint-Denis',
                  infosAcces: 'Code; "4521"',
                },
                {
                  rue: '8 avenue de la Victoire',
                  complement: 'Local 2',
                  codePostal: '97410',
                  ville: 'Saint-Pierre',
                },
              ],
            },
          },
        });
        await prisma.client.create({
          data: {
            typeClient: 'PROFESSIONNEL',
            raisonSociale: 'Boulangerie Hoarau',
            telephone: '0262987654',
            adresses: {
              create: [{ rue: '1 rue du Four', codePostal: '97400', ville: 'Saint-Denis' }],
            },
          },
        });
        const exporte = await gestionnaire().get('/clients/export').buffer(true).expect(200);
        const avant = await etatDesClients();

        const analyse = await analyser({ contenu: exporte.text }).expect(200);
        const rapport = await importer({
          contenu: exporte.text,
          strategieDoublons: 'METTRE_A_JOUR',
        }).expect(200);

        expect(analyse.body.colonnesIgnorees).toEqual(['id', 'archive', 'cree_le']);
        expect(analyse.body.totaux).toEqual({ lignes: 3, valides: 0, doublons: 3, invalides: 0 });
        expect(rapport.body.totaux).toEqual({ crees: 0, misAJour: 3, ignores: 0, rejetes: 0 });
        const apres = await etatDesClients();
        expect(apres.adresses).toEqual(avant.adresses);
        // Rien ne change : la formule neutralisée revient sans son apostrophe.
        expect(apres.clients.map(({ majLe: _majLe, ...client }) => client)).toEqual(
          avant.clients.map(({ majLe: _majLe, ...client }) => client),
        );
      });
    });
  });

  describe('lecture du corps (décision 1 du plan)', () => {
    it('refuse un corps de plus de 1,5 Mo sur l’import (413), au format d’erreur de l’API', async () => {
      const contenu = `${EN_TETE}\n${'x'.repeat(2 * 1024 * 1024)}`;

      const reponse = await importer({ contenu, strategieDoublons: 'IGNORER' }).expect(413);

      expect(reponse.body).toEqual({ statusCode: 413, message: 'request entity too large' });
      expect(await application.prisma.client.count()).toBe(0);
    });

    it('accepte plus de 100 Ko sur l’analyse', async () => {
      const lignes = Array.from(
        { length: 1000 },
        (_, rang) => `${ligneNumero(rang)}${' '.repeat(150)}`,
      );
      const corps = { contenu: fichier(...lignes) };
      expect(JSON.stringify(corps).length).toBeGreaterThan(200_000);

      const reponse = await analyser(corps).expect(200);

      expect(reponse.body.totaux.valides).toBe(1000);
    });

    it('garde la limite de 100 Ko sur les autres routes JSON', async () => {
      await gestionnaire()
        .post('/clients')
        .send({ nomClient: 'x'.repeat(150_000) })
        .expect(413);
    });

    it('lit un formulaire urlencoded comme avant : champ inconnu refusé en 400', async () => {
      const reponse = await gestionnaire()
        .post('/clients')
        .type('form')
        .send('estAdmin=true')
        .expect(400);

      expect(reponse.body.message).toEqual(['Le champ estAdmin n’est pas autorisé']);
    });

    it('garde la limite de 100 Ko du formulaire urlencoded, même sur l’import', async () => {
      await gestionnaire()
        .post('/clients/import')
        .type('form')
        .send(`contenu=${'x'.repeat(150_000)}`)
        .expect(413);
    });
  });

  describe('droits', () => {
    it.each(['/clients/import/analysis', '/clients/import'])(
      'refuse le technicien sur %s (403) : seul l’accès refusé est journalisé',
      async (route) => {
        await en(fixtures.technicien)
          .post(route)
          .send({ contenu: fichier(DUPONT), strategieDoublons: 'IGNORER' })
          .expect(403);

        expect(actionsJournalisees().map(({ type }) => type)).toEqual(['ACCES_REFUSE']);
        expect(await application.prisma.client.count()).toBe(0);
      },
    );

    it.each(['/clients/import/analysis', '/clients/import'])(
      'répond 401 sans utilisateur sur %s',
      async (route) => {
        await en()
          .post(route)
          .send({ contenu: fichier(DUPONT) })
          .expect(401);
      },
    );

    it('autorise l’administrateur', async () => {
      await en(fixtures.admin)
        .post('/clients/import')
        .send({ contenu: fichier(DUPONT), strategieDoublons: 'IGNORER' })
        .expect(200);
    });
  });

  describe('RG29 : une erreur de la base annule tout l’import', () => {
    const PIEGE = 'Piège-RG29';

    beforeAll(async () => {
      // Le déclencheur imite une contrainte CHECK, détail compris (« Failing row contains… »),
      // sur une valeur que la validation laisse passer. DDL fixe : aucune valeur interpolée.
      await application.prisma.$executeRaw`
        CREATE FUNCTION echouer_import_rg29() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.nom_client = 'Piège-RG29' THEN
            RAISE EXCEPTION 'new row for relation "client" violates check constraint "client_test_rg29"'
              USING ERRCODE = '23514',
                DETAIL = 'Failing row contains (' || NEW.nom_client || ', ' || NEW.telephone || ').';
          END IF;
          RETURN NEW;
        END $$`;
      await application.prisma.$executeRaw`
        CREATE TRIGGER echouer_import_rg29 BEFORE INSERT ON client
        FOR EACH ROW EXECUTE FUNCTION echouer_import_rg29()`;
    });

    afterAll(async () => {
      await application.prisma.$executeRaw`DROP TRIGGER echouer_import_rg29 ON client`;
      await application.prisma.$executeRaw`DROP FUNCTION echouer_import_rg29()`;
    });

    it('n’enregistre aucun client du fichier quand la 4e ligne sur 6 échoue en base', async () => {
      const lignes = Array.from({ length: 6 }, (_, rang) =>
        rang === 2 ? `${PIEGE};;;0692777777;1 rue;97400;Saint-Denis` : ligneNumero(rang),
      );
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const reponse = await importer({ contenu: fichier(...lignes), strategieDoublons: 'IGNORER' });

      expect(reponse.status).toBe(500);
      expect(reponse.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(await application.prisma.client.count()).toBe(0);
      expect(await application.prisma.adresse.count()).toBe(0);
      expect(actionsJournalisees()).toEqual([]);
    });

    it('journalise le code PostgreSQL et la contrainte, jamais le nom ni le téléphone de la ligne', async () => {
      const erreurs = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const sortie: string[] = [];
      for (const flux of [process.stdout, process.stderr]) {
        vi.spyOn(flux, 'write').mockImplementation((morceau: string | Uint8Array) => {
          sortie.push(String(morceau));
          return true;
        });
      }

      const reponse = await importer({
        contenu: fichier(`${PIEGE};;;0692777777;1 rue;97400;Saint-Denis`),
        strategieDoublons: 'IGNORER',
      });

      expect(reponse.status).toBe(500);
      expect(erreurs).toHaveBeenCalledTimes(1);
      const journaux = JSON.stringify(erreurs.mock.calls) + sortie.join('');
      expect(journaux).toContain('PostgreSQL 23514');
      expect(journaux).toContain('contrainte client_test_rg29');
      expect(journaux).not.toMatch(/Piège|0692777777|Failing row/);
      expect(reponse.text).not.toMatch(/Piège|0692777777|23514|client_test_rg29/);
    });
  });

  describe('concurrence (RG29 : deux imports ne s’exécutent jamais en même temps)', () => {
    it('crée chaque client une seule fois quand le même fichier est importé deux fois en même temps', async () => {
      const contenu = fichier(...Array.from({ length: 60 }, (_, rang) => ligneNumero(rang)));

      const [premier, second] = await Promise.all([
        importer({ contenu, strategieDoublons: 'IGNORER' }),
        importer({ contenu, strategieDoublons: 'IGNORER' }),
      ]);

      expect([premier.status, second.status]).toEqual([200, 200]);
      expect(await application.prisma.client.count()).toBe(60);
      const totaux = [premier.body.totaux, second.body.totaux].sort((a, b) => b.crees - a.crees);
      expect(totaux).toEqual([
        { crees: 60, misAJour: 0, ignores: 0, rejetes: 0 },
        { crees: 0, misAJour: 0, ignores: 60, rejetes: 0 },
      ]);
    });

    it(
      'répond 409 quand le verrou est tenu plus de 10 secondes, sans rien enregistrer',
      { timeout: 30_000 },
      async () => {
        // Verrou de session tenu par une autre connexion : il entre en conflit avec celui de l'import.
        const autre = new ClientPostgres({ connectionString: process.env.DATABASE_URL });
        await autre.connect();
        try {
          await autre.query('SELECT pg_advisory_lock($1)', [CLE_DU_VERROU_D_IMPORT]);

          const reponse = await importer({
            contenu: fichier(DUPONT),
            strategieDoublons: 'IGNORER',
          });

          expect(reponse.status).toBe(409);
          expect(reponse.body).toEqual({
            statusCode: 409,
            message: 'Un import est déjà en cours, réessayez dans un instant.',
            error: 'Conflict',
          });
          expect(await application.prisma.client.count()).toBe(0);
          expect(actionsJournalisees()).toEqual([]);
        } finally {
          await autre.query('SELECT pg_advisory_unlock($1)', [CLE_DU_VERROU_D_IMPORT]);
          await autre.end();
        }
      },
    );
  });
});
