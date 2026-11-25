/*
 * Données de test de Plumbly, pour le développement local uniquement.
 * Lancement : npx prisma db seed (exécuté par Node 24 directement, sans compilation).
 *
 * Le script vide d'abord toutes les tables : il ne doit jamais tourner en production.
 * Les dates sont calculées à partir du jour courant pour que le planning du jour et
 * du lendemain contienne toujours quelque chose.
 */
import { argon2Sync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  Prisma,
  PrismaClient,
  StatutIntervention,
  Urgence,
} from '../src/generated/prisma/client.ts';
import { creerAdaptateurPostgres } from '../src/prisma/adaptateur-postgres.ts';

// La Réunion est en UTC+4 toute l'année (pas d'heure d'été) : un décalage fixe suffit.
const DECALAGE_REUNION_HEURES = 4;
const DIMANCHE = 0;
const MILLISECONDES_PAR_HEURE = 3_600_000;

// Paramètres argon2id minimaux recommandés par l'OWASP (19 Mio, 2 passes, 1 fil).
const ARGON2_MEMOIRE_KIO = 19_456;
const ARGON2_PASSES = 2;
const ARGON2_PARALLELISME = 1;
const ARGON2_TAILLE_SEL = 16;
const ARGON2_TAILLE_EMPREINTE = 32;

interface Jour {
  annee: number;
  mois: number;
  jour: number;
}

type Transaction = Prisma.TransactionClient;
type ClientAvecAdresses = Prisma.ClientGetPayload<{ include: { adresses: true } }>;
type TypeIntervention = Prisma.TypeInterventionGetPayload<object>;
type Technicien = Prisma.TechnicienGetPayload<object>;

interface Comptes {
  idGestionnaire: number;
  techniciens: Technicien[];
}

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

/**
 * Empreinte au format PHC ($argon2id$v=19$m=…,t=…,p=…$sel$empreinte), le format lu par
 * les bibliothèques argon2 : la card #13 pourra vérifier ces mots de passe telle quelle.
 */
function hacherMotDePasse(motDePasse: string): string {
  const sel = randomBytes(ARGON2_TAILLE_SEL);
  const empreinte = argon2Sync('argon2id', {
    message: motDePasse,
    nonce: sel,
    memory: ARGON2_MEMOIRE_KIO,
    passes: ARGON2_PASSES,
    parallelism: ARGON2_PARALLELISME,
    tagLength: ARGON2_TAILLE_EMPREINTE,
  });
  const parametres = `m=${ARGON2_MEMOIRE_KIO},t=${ARGON2_PASSES},p=${ARGON2_PARALLELISME}`;
  return `$argon2id$v=19$${parametres}$${sel.toString('base64url')}$${empreinte.toString('base64url')}`;
}

/** Les n prochains jours ouvrés (lundi à samedi, RG11) à La Réunion, à partir d'aujourd'hui inclus. */
function prochainsJoursOuvres(nombre: number): Jour[] {
  const maintenantReunion = new Date(
    Date.now() + DECALAGE_REUNION_HEURES * MILLISECONDES_PAR_HEURE,
  );
  const jours: Jour[] = [];
  const curseur = new Date(
    Date.UTC(
      maintenantReunion.getUTCFullYear(),
      maintenantReunion.getUTCMonth(),
      maintenantReunion.getUTCDate(),
    ),
  );
  while (jours.length < nombre) {
    if (curseur.getUTCDay() !== DIMANCHE) {
      jours.push({
        annee: curseur.getUTCFullYear(),
        mois: curseur.getUTCMonth() + 1,
        jour: curseur.getUTCDate(),
      });
    }
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }
  return jours;
}

/** Valeur d'une colonne DATE (date_tournee). */
function dateSeule({ annee, mois, jour }: Jour): Date {
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/** Heure locale de La Réunion convertie en instant UTC, comme il sera stocké. */
function heureReunion({ annee, mois, jour }: Jour, heure: number, minute = 0): Date {
  return new Date(Date.UTC(annee, mois - 1, jour, heure - DECALAGE_REUNION_HEURES, minute));
}

function ilYA(heures: number): Date {
  return new Date(Date.now() - heures * MILLISECONDES_PAR_HEURE);
}

function lireVariable(nom: string): string {
  const valeur = process.env[nom];
  if (valeur === undefined || valeur.trim() === '') {
    throw new Error(`${nom} manquante : la définir dans backend/.env (voir .env.example).`);
  }
  return valeur;
}

async function viderLesTables(tx: Transaction): Promise<void> {
  // SQL écrit à la main : un seul TRUNCATE vide toutes les tables malgré les clés étrangères
  // en RESTRICT, et remet les identifiants à 1 pour que les données de test soient stables.
  await tx.$executeRaw`
    TRUNCATE TABLE
      signature_intervention, intervention, tournee, indisponibilite, technicien,
      adresse, client, type_intervention, jeton_rafraichissement, jeton_reinitialisation,
      utilisateur
    RESTART IDENTITY`;
}

async function creerComptes(tx: Transaction, motDePasseHash: string): Promise<Comptes> {
  const compte = { motDePasseHash, mdpAChanger: false };
  await tx.utilisateur.create({
    data: { ...compte, email: 'admin@plumbly.test', nom: 'Bidel', prenom: 'Arnaud', role: 'ADMIN' },
  });
  const gestionnaire = await tx.utilisateur.create({
    data: {
      ...compte,
      email: 'gestion@plumbly.test',
      nom: 'Payet',
      prenom: 'Céline',
      role: 'GESTIONNAIRE',
    },
  });
  const fiches = [
    {
      email: 'kevin.hoarau@plumbly.test',
      nom: 'Hoarau',
      prenom: 'Kévin',
      telephone: '0692000001',
      couleur: '#0F766E',
    },
    {
      email: 'mathieu.grondin@plumbly.test',
      nom: 'Grondin',
      prenom: 'Mathieu',
      telephone: '0692000002',
      couleur: '#AF4C00',
    },
    {
      email: 'sarah.techer@plumbly.test',
      nom: 'Técher',
      prenom: 'Sarah',
      telephone: '0692000003',
      couleur: '#4F46E5',
    },
  ];
  const techniciens: Technicien[] = [];
  // Créations une par une (pas de Promise.all) : les identifiants restent les mêmes à chaque seed.
  for (const { telephone, couleur, ...utilisateur } of fiches) {
    techniciens.push(
      await tx.technicien.create({
        data: {
          telephone,
          couleurPlanning: couleur,
          utilisateur: { create: { ...compte, ...utilisateur, role: 'TECHNICIEN' } },
        },
      }),
    );
  }
  // Un ancien technicien, archivé et désactivé : il ne doit plus apparaître dans le planning.
  await tx.technicien.create({
    data: {
      telephone: '0692000004',
      couleurPlanning: '#6B7280',
      archive: true,
      archiveLe: ilYA(24 * 30),
      utilisateur: {
        create: {
          ...compte,
          email: 'jean.robert@plumbly.test',
          nom: 'Robert',
          prenom: 'Jean',
          role: 'TECHNICIEN',
          actif: false,
        },
      },
    },
  });
  return { idGestionnaire: gestionnaire.id, techniciens };
}

async function creerTypesIntervention(tx: Transaction): Promise<TypeIntervention[]> {
  return tx.typeIntervention.createManyAndReturn({
    data: [
      { libelle: 'Recherche de fuite', dureeDefautMin: 60 },
      { libelle: 'Débouchage de canalisation', dureeDefautMin: 45 },
      { libelle: 'Remplacement de chauffe-eau', dureeDefautMin: 180 },
      { libelle: 'Entretien de chauffe-eau solaire', dureeDefautMin: 90 },
      { libelle: 'Réparation de robinetterie', dureeDefautMin: 45 },
      { libelle: 'Installation sanitaire', dureeDefautMin: 240 },
    ],
  });
}

async function creerClients(tx: Transaction): Promise<ClientAvecAdresses[]> {
  const archivage = { archive: true, archiveLe: ilYA(24 * 60) };
  const fiches: Prisma.ClientCreateInput[] = [
    {
      typeClient: 'PARTICULIER',
      nomClient: 'Hoareau',
      prenomClient: 'Josiane',
      telephone: '0262000101',
      emailClient: 'josiane.hoareau@exemple.test',
      adresses: {
        create: [
          {
            rue: '12 rue de Paris',
            codePostal: '97400',
            ville: 'Saint-Denis',
            infosAcces: 'Portail vert, sonner deux fois',
          },
        ],
      },
    },
    {
      typeClient: 'PARTICULIER',
      nomClient: 'Maillot',
      prenomClient: 'Didier',
      telephone: '0692000102',
      adresses: {
        create: [
          { rue: '8 chemin des Goyaviers', codePostal: '97430', ville: 'Le Tampon' },
          {
            rue: '3 allée des Filaos',
            codePostal: '97434',
            ville: 'Saint-Gilles-les-Bains',
            infosAcces: 'Location saisonnière, clé chez le voisin',
          },
        ],
      },
    },
    {
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Boulangerie du Barachois',
      telephone: '0262000103',
      emailClient: 'contact@boulangerie-barachois.test',
      adresses: {
        create: [
          {
            rue: '45 boulevard Gabriel Macé',
            codePostal: '97400',
            ville: 'Saint-Denis',
            infosAcces: 'Entrée livraison à l’arrière',
          },
        ],
      },
    },
    {
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Syndic Résidence Les Lataniers',
      telephone: '0262000104',
      emailClient: 'syndic.lataniers@exemple.test',
      adresses: {
        create: [
          {
            rue: '20 rue Archambaud',
            codePostal: '97410',
            ville: 'Saint-Pierre',
            infosAcces: 'Local technique au sous-sol',
          },
        ],
      },
    },
    {
      // Ancien client archivé : il ne doit plus sortir dans les recherches.
      typeClient: 'PARTICULIER',
      nomClient: 'Fontaine',
      prenomClient: 'Ludovic',
      telephone: '0692000105',
      ...archivage,
      adresses: {
        create: [
          { rue: '5 rue du Four à Chaux', codePostal: '97460', ville: 'Saint-Paul', ...archivage },
        ],
      },
    },
  ];
  const clients: ClientAvecAdresses[] = [];
  for (const data of fiches) {
    clients.push(await tx.client.create({ data, include: { adresses: true } }));
  }
  return clients;
}

async function creerIndisponibilite(
  tx: Transaction,
  technicien: Technicien,
  jours: Jour[],
): Promise<void> {
  const [, , apresDemain, dansTroisJours] = jours;
  await tx.indisponibilite.create({
    data: {
      idTechnicien: technicien.id,
      debut: heureReunion(apresDemain, 7),
      fin: heureReunion(dansTroisJours, 19),
      motif: 'Congés',
    },
  });
}

/** Planning de démonstration : la tournée du jour de Kévin et celle de demain de Mathieu. */
async function creerTournees(
  tx: Transaction,
  comptes: Comptes,
  jours: Jour[],
): Promise<{ duJour: number; deDemain: number }> {
  const [kevin, mathieu] = comptes.techniciens;
  const [aujourdhui, demain] = jours;
  const duJour = await tx.tournee.create({
    data: {
      dateTournee: dateSeule(aujourdhui),
      idTechnicien: kevin.id,
      idCreateur: comptes.idGestionnaire,
    },
  });
  const deDemain = await tx.tournee.create({
    data: {
      dateTournee: dateSeule(demain),
      idTechnicien: mathieu.id,
      idCreateur: comptes.idGestionnaire,
    },
  });
  return { duJour: duJour.id, deDemain: deDemain.id };
}

async function creerInterventions(
  tx: Transaction,
  comptes: Comptes,
  types: TypeIntervention[],
  clients: ClientAvecAdresses[],
  jours: Jour[],
): Promise<void> {
  const [fuite, debouchage, chauffeEau, solaire, robinetterie] = types;
  const [josiane, didier, boulangerie, syndic] = clients;
  const [aujourdhui, demain] = jours;
  const tournees = await creerTournees(tx, comptes, jours);
  const commun = { idCreateur: comptes.idGestionnaire, urgence: Urgence.NORMALE };

  await tx.intervention.createMany({
    data: [
      // Tournée du jour : une terminée, une en cours, une planifiée.
      {
        ...commun,
        idAdresse: josiane.adresses[0].id,
        idTypeIntervention: fuite.id,
        description: 'Fuite sous l’évier de la cuisine, traces d’humidité sur le meuble.',
        urgence: Urgence.PRIORITAIRE,
        statut: StatutIntervention.TERMINEE,
        dureeEstimeeMin: 60,
        idTournee: tournees.duJour,
        ordreTournee: 1,
        debutPrevu: heureReunion(aujourdhui, 8),
        demarreeLe: heureReunion(aujourdhui, 8, 5),
        termineeLe: heureReunion(aujourdhui, 8, 50),
        compteRendu: 'Joint du siphon remplacé, plus de fuite constatée.',
      },
      {
        ...commun,
        idAdresse: boulangerie.adresses[0].id,
        idTypeIntervention: debouchage.id,
        description: 'Évacuation du lavabo du laboratoire bouchée.',
        statut: StatutIntervention.EN_COURS,
        dureeEstimeeMin: 45,
        idTournee: tournees.duJour,
        ordreTournee: 2,
        debutPrevu: heureReunion(aujourdhui, 10),
        demarreeLe: heureReunion(aujourdhui, 10, 10),
      },
      {
        ...commun,
        idAdresse: didier.adresses[0].id,
        idTypeIntervention: solaire.id,
        description: 'Entretien annuel du chauffe-eau solaire.',
        statut: StatutIntervention.PLANIFIEE,
        dureeEstimeeMin: 90,
        idTournee: tournees.duJour,
        ordreTournee: 3,
        debutPrevu: heureReunion(aujourdhui, 14),
      },
      // Tournée de demain.
      {
        ...commun,
        idAdresse: syndic.adresses[0].id,
        idTypeIntervention: chauffeEau.id,
        description: 'Remplacement du chauffe-eau collectif du local technique.',
        statut: StatutIntervention.PLANIFIEE,
        dureeEstimeeMin: 180,
        idTournee: tournees.deDemain,
        ordreTournee: 1,
        debutPrevu: heureReunion(demain, 8),
      },
      {
        ...commun,
        idAdresse: didier.adresses[1].id,
        idTypeIntervention: robinetterie.id,
        description: 'Mitigeur de douche qui goutte.',
        statut: StatutIntervention.PLANIFIEE,
        dureeEstimeeMin: 45,
        idTournee: tournees.deDemain,
        ordreTournee: 2,
        debutPrevu: heureReunion(demain, 13, 30),
      },
      // À planifier : l'urgente, créée il y a 5 h, doit être signalée au tableau de bord (RG19).
      {
        ...commun,
        idAdresse: syndic.adresses[0].id,
        idTypeIntervention: fuite.id,
        description: 'Fuite importante dans la cage d’escalier B, eau coupée en partie.',
        urgence: Urgence.URGENTE,
        dureeEstimeeMin: 90,
        creeLe: ilYA(5),
      },
      {
        ...commun,
        idAdresse: boulangerie.adresses[0].id,
        idTypeIntervention: robinetterie.id,
        description: 'Robinet du plan de travail difficile à fermer.',
        urgence: Urgence.PRIORITAIRE,
        dureeEstimeeMin: 45,
      },
      {
        ...commun,
        idAdresse: josiane.adresses[0].id,
        idTypeIntervention: chauffeEau.id,
        description: 'Devis accepté : remplacement du cumulus de 150 L.',
        dureeEstimeeMin: 180,
      },
      {
        ...commun,
        idAdresse: didier.adresses[0].id,
        idTypeIntervention: debouchage.id,
        description: 'WC bouché.',
        statut: StatutIntervention.ANNULEE,
        dureeEstimeeMin: 45,
        annuleeLe: ilYA(20),
        motifAnnulation: 'Le client a résolu le problème lui-même.',
      },
    ],
  });
}

async function remplirLaBase(tx: Transaction, motDePasseHash: string): Promise<void> {
  const jours = prochainsJoursOuvres(4);
  await viderLesTables(tx);
  const comptes = await creerComptes(tx, motDePasseHash);
  const types = await creerTypesIntervention(tx);
  const clients = await creerClients(tx);
  await creerIndisponibilite(tx, comptes.techniciens[2], jours);
  await creerInterventions(tx, comptes, types, clients, jours);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed refusé : il vide toutes les tables et ne doit pas tourner en production.',
    );
  }
  const prisma = new PrismaClient({
    adapter: creerAdaptateurPostgres(lireVariable('DATABASE_URL')),
  });
  try {
    const motDePasseHash = hacherMotDePasse(lireVariable('SEED_MOT_DE_PASSE'));
    // Une seule transaction : si une insertion échoue, la base garde ses données précédentes.
    await prisma.$transaction((tx) => remplirLaBase(tx, motDePasseHash), { timeout: 30_000 });
    console.log(
      'Données de test créées. Comptes : admin@, gestion@ et les techniciens @plumbly.test.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
