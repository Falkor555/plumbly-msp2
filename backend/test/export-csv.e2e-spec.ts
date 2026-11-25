import type { Response } from 'supertest';
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
 * Tests d'intégration des exports CSV (US29, US32, issue #47) : routes HTTP, droits, filtres et
 * tri de la liste, format du fichier (RG26) et journal (RG25), sur la base de Testcontainers.
 */

// Lundi 7 décembre 2026, 9 h à La Réunion : le temps est figé pour toute la campagne.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');
const BOM = '﻿';

const EN_TETE_CLIENTS =
  'id;type_client;nom;prenom;raison_sociale;telephone;email;rue;complement;code_postal;ville;' +
  'infos_acces;archive;cree_le';

/** Fichier reçu, octet par octet : le BOM et les fins de ligne sont vérifiés tels quels. */
function telecharger(requete: ReturnType<ReturnType<typeof requetesEn>['get']>) {
  return requete.buffer(true).parse((reponse, fin) => {
    const morceaux: Buffer[] = [];
    reponse.on('data', (morceau: Buffer) => morceaux.push(morceau));
    reponse.on('end', () => fin(null, Buffer.concat(morceaux)));
  });
}

function texteDe(reponse: Response): string {
  return (reponse.body as Buffer).toString('utf8');
}

/** Lignes physiques du fichier, BOM et dernière fin de ligne retirés. */
function lignesDe(reponse: Response): string[] {
  return texteDe(reponse).slice(BOM.length).split('\r\n').slice(0, -1);
}

/**
 * Cellules du fichier, guillemets RFC 4180 compris (le lecteur de l'import n'existe pas encore à
 * l'étape 1 : celui-ci ne sert qu'aux tests).
 */
function cellulesDe(reponse: Response): string[][] {
  const texte = texteDe(reponse).slice(BOM.length);
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = '';
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i += 1) {
    const caractere = texte[i];
    if (entreGuillemets) {
      if (caractere === '"' && texte[i + 1] === '"') {
        cellule += '"';
        i += 1;
      } else if (caractere === '"') {
        entreGuillemets = false;
      } else {
        cellule += caractere;
      }
    } else if (caractere === '"') {
      entreGuillemets = true;
    } else if (caractere === ';') {
      ligne.push(cellule);
      cellule = '';
    } else if (caractere === '\r' && texte[i + 1] === '\n') {
      lignes.push([...ligne, cellule]);
      ligne = [];
      cellule = '';
      i += 1;
    } else {
      cellule += caractere;
    }
  }
  return lignes;
}

interface Fixtures {
  admin: UtilisateurConnecte;
  gestionnaire: UtilisateurConnecte;
  technicien: UtilisateurConnecte;
}

describe('exports CSV (e2e)', () => {
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
      TRUNCATE TABLE signature_intervention, intervention, tournee, indisponibilite, technicien,
        adresse, client, type_intervention
      RESTART IDENTITY`;
  });

  afterAll(async () => {
    await viderLaBase(application.prisma);
    await application.app.close();
  });

  const en = (utilisateur?: UtilisateurConnecte) => requetesEn(application.app, utilisateur);
  const gestionnaire = () => en(fixtures.gestionnaire);

  /** Actions envoyées au journal simulé depuis le début du test. */
  function actionsJournalisees(): ActionJournalisee[] {
    return journal.enregistrer.mock.calls.map(([action]) => action as ActionJournalisee);
  }

  interface ClientACreer {
    typeClient?: 'PARTICULIER' | 'PROFESSIONNEL';
    nomClient?: string | null;
    prenomClient?: string | null;
    raisonSociale?: string | null;
    telephone?: string;
    emailClient?: string | null;
    archive?: boolean;
    creeLe?: string;
    adresses?: {
      rue: string;
      complement?: string;
      codePostal?: string;
      ville?: string;
      infosAcces?: string;
      archive?: boolean;
    }[];
  }

  /** Client écrit directement en base : nom, date de création et archivage choisis par le test. */
  async function creerClient({
    adresses = [{ rue: '12 rue des Manguiers' }],
    // Fixée : sinon la base prendrait l'heure réelle, et le jour exporté changerait chaque jour.
    creeLe = '2026-12-01T06:00:00Z',
    archive = false,
    ...identite
  }: ClientACreer = {}): Promise<number> {
    const client = await application.prisma.client.create({
      data: {
        typeClient: 'PARTICULIER',
        nomClient: 'Dupont',
        telephone: '0692123456',
        ...identite,
        archive,
        archiveLe: archive ? MAINTENANT : null,
        creeLe: new Date(creeLe),
        adresses: {
          create: adresses.map(({ archive: adresseArchivee = false, ...adresse }) => ({
            codePostal: '97400',
            ville: 'Saint-Denis',
            ...adresse,
            archive: adresseArchivee,
            archiveLe: adresseArchivee ? MAINTENANT : null,
          })),
        },
      },
    });
    return client.id;
  }

  describe('GET /clients/export (US32)', () => {
    const exporter = (requete = '', utilisateur = fixtures.gestionnaire) =>
      telecharger(en(utilisateur).get(`/clients/export${requete}`));

    it('répond un fichier CSV téléchargeable, daté du jour à La Réunion, jamais mis en cache', async () => {
      await creerClient();

      const reponse = await exporter().expect(200);

      expect(reponse.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(reponse.headers['content-disposition']).toBe(
        'attachment; filename="clients-2026-12-07.csv"',
      );
      expect(reponse.headers['cache-control']).toBe('no-store');
    });

    it('commence par le BOM UTF-8 (EF BB BF) et termine chaque ligne par CRLF', async () => {
      await creerClient();

      const reponse = await exporter().expect(200);
      const octets = reponse.body as Buffer;

      expect([...octets.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(texteDe(reponse)).toBe(
        `${BOM}${EN_TETE_CLIENTS}\r\n1;PARTICULIER;Dupont;;;0692123456;;12 rue des Manguiers;;` +
          '97400;Saint-Denis;;non;2026-12-01\r\n',
      );
    });

    it('écrit une ligne par adresse active, accents compris, dans l’ordre de la liste', async () => {
      await creerClient({
        nomClient: 'Hoarau',
        prenomClient: 'Hélène',
        emailClient: 'helene.hoarau@exemple.re',
        creeLe: '2026-11-20T06:00:00Z',
        adresses: [
          { rue: '12 rue des Manguiers', infosAcces: 'Code 4521' },
          { rue: '3 chemin Archivé', archive: true },
          { rue: '8 avenue de la Victoire', complement: 'Bât. B; 2e', codePostal: '97410' },
        ],
      });
      await creerClient({
        typeClient: 'PROFESSIONNEL',
        nomClient: null,
        raisonSociale: 'Boulangerie Abélard',
        telephone: '0262987654',
        creeLe: '2026-11-21T06:00:00Z',
      });

      const reponse = await exporter().expect(200);

      expect(lignesDe(reponse)).toEqual([
        EN_TETE_CLIENTS,
        '2;PROFESSIONNEL;;;Boulangerie Abélard;0262987654;;12 rue des Manguiers;;97400;' +
          'Saint-Denis;;non;2026-11-21',
        '1;PARTICULIER;Hoarau;Hélène;;0692123456;helene.hoarau@exemple.re;12 rue des Manguiers;;' +
          '97400;Saint-Denis;Code 4521;non;2026-11-20',
        '1;PARTICULIER;Hoarau;Hélène;;0692123456;helene.hoarau@exemple.re;' +
          '8 avenue de la Victoire;"Bât. B; 2e";97410;Saint-Denis;;non;2026-11-20',
      ]);
    });

    it('applique les filtres de la liste : recherche, type et archivés', async () => {
      await creerClient({ nomClient: 'Grondin' });
      await creerClient({
        nomClient: 'Grondin',
        typeClient: 'PROFESSIONNEL',
        raisonSociale: 'SARL Grondin',
      });
      await creerClient({ nomClient: 'Grondin', archive: true });
      await creerClient({ nomClient: 'Payet' });

      const parDefaut = await exporter('?recherche=grondin').expect(200);
      const avecArchives = await exporter('?recherche=grondin&archives=true').expect(200);
      const professionnels = await exporter('?typeClient=PROFESSIONNEL').expect(200);

      const identifiants = (reponse: Response) =>
        cellulesDe(reponse)
          .slice(1)
          .map(([id]) => id);
      expect(identifiants(parDefaut).sort()).toEqual(['1', '2']);
      expect(identifiants(avecArchives).sort()).toEqual(['1', '2', '3']);
      expect(identifiants(professionnels)).toEqual(['2']);
    });

    it('respecte le tri demandé', async () => {
      await creerClient({ nomClient: 'Ancien', creeLe: '2026-11-01T06:00:00Z' });
      await creerClient({ nomClient: 'Récent', creeLe: '2026-11-30T06:00:00Z' });
      await creerClient({ nomClient: 'Moyen', creeLe: '2026-11-15T06:00:00Z' });

      const reponse = await exporter('?tri=-creeLe').expect(200);

      expect(
        cellulesDe(reponse)
          .slice(1)
          .map(([, , nom]) => nom),
      ).toEqual(['Récent', 'Moyen', 'Ancien']);
    });

    it('écrit un client archivé sans adresse active sur une ligne aux colonnes d’adresse vides', async () => {
      await creerClient({ archive: true, adresses: [{ rue: '1 rue Ancienne', archive: true }] });

      const reponse = await exporter('?archives=true').expect(200);

      expect(lignesDe(reponse)[1]).toBe('1;PARTICULIER;Dupont;;;0692123456;;;;;;;oui;2026-12-01');
    });

    it('neutralise une formule =HYPERLINK(…) placée dans un nom de client', async () => {
      await creerClient({ nomClient: '=HYPERLINK("http://exemple.re/piege";"Cliquez")' });

      const reponse = await exporter().expect(200);

      expect(cellulesDe(reponse)[1][2]).toBe(`'=HYPERLINK("http://exemple.re/piege";"Cliquez")`);
    });

    it.each([
      ['=', '=1+1'],
      ['+', '+33692123456'],
      ['-', '-Dupont'],
      ['@', '@SUM(A1:A9)'],
      ['une tabulation', '\tDupont'],
      ['un retour chariot', '\rDupont'],
    ])('RG26 : un nom qui commence par %s est précédé d’une apostrophe', async (_debut, nom) => {
      await creerClient({ nomClient: nom });

      const reponse = await exporter().expect(200);

      expect(cellulesDe(reponse)[1][2]).toBe(`'${nom}`);
    });

    it('ne préfixe ni l’identifiant ni le téléphone (aucun faux positif)', async () => {
      await creerClient({ telephone: '0692123456' });

      const reponse = await exporter().expect(200);
      const [id, , , , , telephone] = cellulesDe(reponse)[1];

      expect([id, telephone]).toEqual(['1', '0692123456']);
    });

    it('n’est pas captée par GET /clients/:id (pas de 400 « Identifiant invalide. »)', async () => {
      const reponse = await exporter().expect(200);

      expect(reponse.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(lignesDe(reponse)).toEqual([EN_TETE_CLIENTS]);
    });

    it.each(['page=1', 'limit=50'])(
      'refuse %s (400) : le fichier contient toute la liste',
      async (parametre) => {
        const reponse = await gestionnaire().get(`/clients/export?${parametre}`).expect(400);

        expect(reponse.body).toEqual({
          statusCode: 400,
          message: [`Le champ ${parametre.split('=')[0]} n’est pas autorisé`],
          error: 'Bad Request',
        });
        expect(actionsJournalisees()).toEqual([]);
      },
    );

    it('refuse plus de 5 000 lignes (400), sans rien journaliser', async () => {
      await application.prisma.client.createMany({
        data: Array.from({ length: 5001 }, (_, rang) => ({
          typeClient: 'PARTICULIER' as const,
          nomClient: `Client ${rang}`,
          telephone: '0692123456',
        })),
      });

      const reponse = await gestionnaire().get('/clients/export').expect(400);

      expect(reponse.body.message).toBe('L’export dépasse 5 000 lignes : affinez les filtres.');
      expect(actionsJournalisees()).toEqual([]);
    });

    it('autorise l’administrateur', async () => {
      await exporter('', fixtures.admin).expect(200);
    });

    it('refuse le technicien (403) : seul l’accès refusé est journalisé, aucun EXPORT_CSV', async () => {
      await creerClient();

      await en(fixtures.technicien).get('/clients/export').expect(403);

      expect(actionsJournalisees().map(({ type }) => type)).toEqual(['ACCES_REFUSE']);
    });

    it('répond 401 sans utilisateur', async () => {
      await en().get('/clients/export').expect(401);
    });

    it('journalise EXPORT_CSV avec le nombre de lignes et le nom des filtres, jamais leur valeur', async () => {
      await creerClient({ nomClient: 'Grondin', prenomClient: 'Hélène' });

      await exporter('?recherche=H%C3%A9l%C3%A8ne&archives=true').expect(200);

      expect(actionsJournalisees()).toEqual([
        {
          type: 'EXPORT_CSV',
          auteur: { id: fixtures.gestionnaire.id, role: 'GESTIONNAIRE' },
          ressource: 'clients',
          lignes: 1,
          filtres: ['recherche', 'archives'],
        },
      ]);
      expect(JSON.stringify(actionsJournalisees())).not.toMatch(/H[ée]l[èe]ne|Grondin/);
    });
  });

  describe('GET /interventions/export (US29)', () => {
    const EN_TETE_INTERVENTIONS =
      'id;cree_le;client;code_postal;ville;type_intervention;description;urgence;statut;' +
      'duree_estimee_min;debut_prevu;technicien;ordre_tournee;terminee_le;signee';

    const exporter = (requete = '', utilisateur = fixtures.gestionnaire) =>
      telecharger(en(utilisateur).get(`/interventions/export${requete}`));

    interface Planning {
      idType: number;
      idTechnicien: number;
      idTournee: number;
      idAdresseMarie: number;
      idClientMarie: number;
      idAdresseBoulangerie: number;
    }

    let comptesDeTechnicien = 0;

    /** Marie Dupont (particulière) et la boulangerie Hoarau ; tournée du jour de Karim Payet. */
    async function creerPlanning(): Promise<Planning> {
      const { prisma } = application;
      const type = await prisma.typeIntervention.create({
        data: { libelle: 'Chauffe-eau', dureeDefautMin: 90 },
      });
      // Les comptes restent d'un test à l'autre : l'e-mail, unique (RG23), est numéroté.
      comptesDeTechnicien += 1;
      const compte = await creerCompte(prisma, {
        email: `karim-${comptesDeTechnicien}@test.re`,
        nom: 'Payet',
        prenom: 'Karim',
        role: 'TECHNICIEN',
      });
      const technicien = await prisma.technicien.create({
        data: { telephone: '0692000001', couleurPlanning: '#0F766E', idUtilisateur: compte.id },
      });
      const tournee = await prisma.tournee.create({
        data: {
          idTechnicien: technicien.id,
          dateTournee: new Date('2026-12-07T00:00:00Z'),
          idCreateur: fixtures.gestionnaire.id,
        },
      });
      const idClientMarie = await creerClient({
        nomClient: 'Dupont',
        prenomClient: 'Marie',
        emailClient: 'marie.dupont@exemple.re',
        adresses: [{ rue: '12 rue des Manguiers', infosAcces: 'Code 4521' }],
      });
      await creerClient({
        typeClient: 'PROFESSIONNEL',
        nomClient: null,
        raisonSociale: 'Boulangerie Hoarau',
        telephone: '0262987654',
        adresses: [{ rue: '8 avenue de la Victoire', codePostal: '97410', ville: 'Saint-Pierre' }],
      });
      const adresses = await prisma.adresse.findMany({ orderBy: { id: 'asc' } });
      return {
        idType: type.id,
        idTechnicien: technicien.id,
        idTournee: tournee.id,
        idAdresseMarie: adresses[0].id,
        idClientMarie,
        idAdresseBoulangerie: adresses[1].id,
      };
    }

    interface InterventionACreer {
      idAdresse: number;
      description?: string;
      urgence?: 'NORMALE' | 'PRIORITAIRE' | 'URGENTE';
      statut?: 'A_PLANIFIER' | 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';
      creeLe: string;
      planifiee?: { ordre: number; debut: string };
      termineeLe?: string;
      compteRendu?: string;
      motifAnnulation?: string;
    }

    async function creerIntervention(planning: Planning, donnees: InterventionACreer) {
      const intervention = await application.prisma.intervention.create({
        data: {
          description: donnees.description ?? 'Plus d’eau chaude',
          urgence: donnees.urgence ?? 'NORMALE',
          statut: donnees.statut ?? (donnees.planifiee ? 'PLANIFIEE' : 'A_PLANIFIER'),
          dureeEstimeeMin: 90,
          creeLe: new Date(donnees.creeLe),
          idTournee: donnees.planifiee ? planning.idTournee : null,
          ordreTournee: donnees.planifiee?.ordre ?? null,
          debutPrevu: donnees.planifiee ? new Date(donnees.planifiee.debut) : null,
          demarreeLe: donnees.termineeLe
            ? new Date(donnees.planifiee?.debut ?? donnees.creeLe)
            : null,
          termineeLe: donnees.termineeLe ? new Date(donnees.termineeLe) : null,
          compteRendu: donnees.compteRendu ?? null,
          motifAnnulation: donnees.motifAnnulation ?? null,
          annuleeLe: donnees.statut === 'ANNULEE' ? new Date(donnees.creeLe) : null,
          idAdresse: donnees.idAdresse,
          idTypeIntervention: planning.idType,
          idCreateur: fixtures.gestionnaire.id,
        },
      });
      return intervention.id;
    }

    it('répond un fichier CSV daté du jour à La Réunion, jamais mis en cache, avec le BOM', async () => {
      const reponse = await exporter().expect(200);

      expect(reponse.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(reponse.headers['content-disposition']).toBe(
        'attachment; filename="interventions-2026-12-07.csv"',
      );
      expect(reponse.headers['cache-control']).toBe('no-store');
      expect([...(reponse.body as Buffer).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      expect(texteDe(reponse)).toBe(`${BOM}${EN_TETE_INTERVENTIONS}\r\n`);
    });

    it('écrit chaque intervention dans l’ordre de la liste (urgentes, puis plus anciennes)', async () => {
      const planning = await creerPlanning();
      await creerIntervention(planning, {
        idAdresse: planning.idAdresseBoulangerie,
        description: 'Fuite sous l’évier',
        creeLe: '2026-12-01T06:00:00Z',
      });
      const idSignee = await creerIntervention(planning, {
        idAdresse: planning.idAdresseMarie,
        urgence: 'URGENTE',
        statut: 'TERMINEE',
        creeLe: '2026-12-03T21:30:00Z',
        planifiee: { ordre: 1, debut: '2026-12-07T08:00:00+04:00' },
        termineeLe: '2026-12-07T09:42:00+04:00',
        compteRendu: 'Résistance changée',
      });
      await application.prisma.signatureIntervention.create({
        data: {
          idIntervention: idSignee,
          image: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          nomSignataire: 'Jean Signataire',
          signeeLe: new Date('2026-12-07T09:42:00+04:00'),
          empreinte: 'a'.repeat(64),
          idAuteur: fixtures.admin.id,
        },
      });

      const reponse = await exporter().expect(200);

      expect(lignesDe(reponse)).toEqual([
        EN_TETE_INTERVENTIONS,
        '2;2026-12-04;Marie Dupont;97400;Saint-Denis;Chauffe-eau;Plus d’eau chaude;URGENTE;' +
          'TERMINEE;90;2026-12-07 08:00;Karim Payet;1;2026-12-07 09:42;oui',
        '1;2026-12-01;Boulangerie Hoarau;97410;Saint-Pierre;Chauffe-eau;Fuite sous l’évier;' +
          'NORMALE;A_PLANIFIER;90;;;;;non',
      ]);
    });

    it('n’exporte ni téléphone, ni e-mail, ni rue, ni accès, ni compte rendu, ni motif, ni signataire', async () => {
      const planning = await creerPlanning();
      await creerIntervention(planning, {
        idAdresse: planning.idAdresseMarie,
        statut: 'TERMINEE',
        creeLe: '2026-12-03T06:00:00Z',
        planifiee: { ordre: 1, debut: '2026-12-07T08:00:00+04:00' },
        termineeLe: '2026-12-07T09:42:00+04:00',
        compteRendu: 'Résistance changée',
      });
      await creerIntervention(planning, {
        idAdresse: planning.idAdresseMarie,
        statut: 'ANNULEE',
        creeLe: '2026-12-02T06:00:00Z',
        motifAnnulation: 'Motif confidentiel',
      });

      const texte = texteDe(await exporter().expect(200));

      for (const absent of [
        '0692123456',
        'marie.dupont@exemple.re',
        '12 rue des Manguiers',
        'Code 4521',
        'Résistance changée',
        'Motif confidentiel',
      ]) {
        expect(texte).not.toContain(absent);
      }
    });

    it('applique les filtres de la liste : statut, urgence, technicien, client, période, recherche', async () => {
      const planning = await creerPlanning();
      await creerIntervention(planning, {
        idAdresse: planning.idAdresseMarie,
        urgence: 'URGENTE',
        creeLe: '2026-12-01T06:00:00Z',
        planifiee: { ordre: 1, debut: '2026-12-07T08:00:00+04:00' },
      });
      await creerIntervention(planning, {
        idAdresse: planning.idAdresseBoulangerie,
        description: 'Chasse d’eau',
        creeLe: '2026-12-02T06:00:00Z',
      });

      const identifiants = async (requete: string) =>
        cellulesDe(await exporter(requete).expect(200))
          .slice(1)
          .map(([id]) => id);

      expect(await identifiants('?statut=PLANIFIEE')).toEqual(['1']);
      expect(await identifiants('?urgence=NORMALE')).toEqual(['2']);
      expect(await identifiants(`?technicienId=${planning.idTechnicien}`)).toEqual(['1']);
      expect(await identifiants(`?clientId=${planning.idClientMarie}`)).toEqual(['1']);
      expect(await identifiants('?du=2026-12-07&au=2026-12-07')).toEqual(['1']);
      expect(await identifiants('?recherche=chasse')).toEqual(['2']);
    });

    it('respecte le tri demandé', async () => {
      const planning = await creerPlanning();
      for (const jour of ['01', '03', '02']) {
        await creerIntervention(planning, {
          idAdresse: planning.idAdresseMarie,
          creeLe: `2026-12-${jour}T06:00:00Z`,
        });
      }

      const reponse = await exporter('?tri=-creeLe').expect(200);

      expect(
        cellulesDe(reponse)
          .slice(1)
          .map(([id]) => id),
      ).toEqual(['2', '3', '1']);
    });

    it('neutralise une formule dans la description, sans préfixer id, durée ni rang', async () => {
      const planning = await creerPlanning();
      await creerIntervention(planning, {
        idAdresse: planning.idAdresseMarie,
        description: '=HYPERLINK("http://exemple.re/piege";"Cliquez")',
        creeLe: '2026-12-01T06:00:00Z',
        planifiee: { ordre: 1, debut: '2026-12-07T08:00:00+04:00' },
      });

      const [, ligne] = cellulesDe(await exporter().expect(200));

      expect(ligne[6]).toBe(`'=HYPERLINK("http://exemple.re/piege";"Cliquez")`);
      expect([ligne[0], ligne[9], ligne[12]]).toEqual(['1', '90', '1']);
    });

    it('n’est pas captée par GET /interventions/:id (pas de 400 « Identifiant invalide. »)', async () => {
      const reponse = await exporter().expect(200);

      expect(reponse.headers['content-type']).toBe('text/csv; charset=utf-8');
    });

    it.each(['page=1', 'limit=50'])(
      'refuse %s (400) : le fichier contient toute la liste',
      async (parametre) => {
        const reponse = await gestionnaire().get(`/interventions/export?${parametre}`).expect(400);

        expect(reponse.body).toEqual({
          statusCode: 400,
          message: [`Le champ ${parametre.split('=')[0]} n’est pas autorisé`],
          error: 'Bad Request',
        });
        expect(actionsJournalisees()).toEqual([]);
      },
    );

    it('refuse plus de 5 000 lignes (400), sans rien journaliser', async () => {
      const planning = await creerPlanning();
      await application.prisma.intervention.createMany({
        data: Array.from({ length: 5001 }, () => ({
          description: 'Fuite',
          urgence: 'NORMALE' as const,
          dureeEstimeeMin: 30,
          idAdresse: planning.idAdresseMarie,
          idTypeIntervention: planning.idType,
          idCreateur: fixtures.gestionnaire.id,
        })),
      });

      const reponse = await gestionnaire().get('/interventions/export').expect(400);

      expect(reponse.body.message).toBe('L’export dépasse 5 000 lignes : affinez les filtres.');
      expect(actionsJournalisees()).toEqual([]);
    });

    it('autorise l’administrateur', async () => {
      await exporter('', fixtures.admin).expect(200);
    });

    it('refuse le technicien (403) : seul l’accès refusé est journalisé, aucun EXPORT_CSV', async () => {
      await en(fixtures.technicien).get('/interventions/export').expect(403);

      expect(actionsJournalisees().map(({ type }) => type)).toEqual(['ACCES_REFUSE']);
    });

    it('répond 401 sans utilisateur', async () => {
      await en().get('/interventions/export').expect(401);
    });

    it('journalise EXPORT_CSV avec le nombre de lignes et le nom des filtres, jamais leur valeur', async () => {
      const planning = await creerPlanning();
      await creerIntervention(planning, {
        idAdresse: planning.idAdresseMarie,
        creeLe: '2026-12-01T06:00:00Z',
      });

      await exporter('?recherche=Dupont&statut=A_PLANIFIER').expect(200);

      expect(actionsJournalisees()).toEqual([
        {
          type: 'EXPORT_CSV',
          auteur: { id: fixtures.gestionnaire.id, role: 'GESTIONNAIRE' },
          ressource: 'interventions',
          lignes: 1,
          filtres: ['recherche', 'statut'],
        },
      ]);
      expect(JSON.stringify(actionsJournalisees())).not.toContain('Dupont');
    });
  });
});
