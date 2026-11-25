import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { UtilisateurConnecte } from '../../commun/autorisation/utilisateur-connecte.js';
import { JournalDesActions } from '../../journal/journal-des-actions.js';
import { diagnostiquer, estUneErreurDeLaBase } from '../../prisma/erreurs-postgres.js';
import type { IdentiteClient, NouvelleAdresse } from '../clients.types.js';
import { verifierIdentite } from '../regles-clients.js';
import {
  analyserLignes,
  clesDeRecherche,
  MOTIF_CLIENT_ARCHIVE,
  preparerFichier,
  versReponseAnalyse,
} from './analyse-import.js';
import {
  type ClientAMettreAJour,
  ImportClientsRepository,
  ImportDejaEnCours,
  type OperationsDImport,
} from './import-clients.repository.js';
import type {
  DemandeAnalyse,
  DemandeImport,
  FichierPrepare,
  LigneAnalysee,
  LigneImportee,
  RapportImport,
  ReponseAnalyse,
  StrategieDoublons,
} from './import-clients.types.js';

type Doublon = Extract<LigneAnalysee, { resultat: 'DOUBLON' }>;

const IMPORT_EN_COURS = 'Un import est déjà en cours, réessayez dans un instant.';

/**
 * Import des clients depuis un fichier CSV (US31, RG25 à RG29). Deux routes sans état : l'analyse
 * n'écrit rien ; l'import refait toute l'analyse (il ne fait pas confiance à l'aperçu) puis prend
 * ses décisions sous le verrou, et journalise après la validation de la transaction.
 */
@Injectable()
export class ImportClientsService {
  private readonly logger = new Logger(ImportClientsService.name);

  constructor(
    private readonly depot: ImportClientsRepository,
    private readonly journal: JournalDesActions,
  ) {}

  /** POST /clients/import/analysis : rien n'est écrit, ni en base ni dans le journal. */
  async analyser(demande: DemandeAnalyse): Promise<ReponseAnalyse> {
    const fichier = preparerFichier(demande);
    const existants = await this.depot.trouverClientsCorrespondants(clesDeRecherche(fichier));
    return versReponseAnalyse(fichier, analyserLignes(fichier.lignes, existants));
  }

  /** POST /clients/import : une seule transaction (RG29), puis CLIENTS_IMPORTES (RG25). */
  async importer(demande: DemandeImport, auteur: UtilisateurConnecte): Promise<RapportImport> {
    const fichier = preparerFichier(demande);
    const rapport = await this.enregistrer(fichier, demande.strategieDoublons);
    await this.journal.enregistrer({
      type: 'CLIENTS_IMPORTES',
      auteur: { id: auteur.id, role: auteur.role },
      strategieDoublons: demande.strategieDoublons,
      ...rapport.totaux,
    });
    return rapport;
  }

  private async enregistrer(
    fichier: FichierPrepare,
    strategie: StrategieDoublons,
  ): Promise<RapportImport> {
    try {
      return await this.depot.importer((operations) =>
        importerLesLignes(operations, fichier, strategie),
      );
    } catch (erreur) {
      if (erreur instanceof ImportDejaEnCours) {
        throw new ConflictException(IMPORT_EN_COURS);
      }
      if (estUneErreurDeLaBase(erreur)) {
        throw this.masquerErreurDeLaBase(erreur);
      }
      throw erreur;
    }
  }

  /**
   * Le message et le détail de PostgreSQL peuvent citer la ligne refusée (nom, téléphone…) : seuls
   * les codes et le nom de la contrainte sont journalisés, sans la pile qui reprend le message.
   * La réponse est le 500 générique de l'API, sans cause attachée.
   */
  private masquerErreurDeLaBase(erreur: unknown): HttpException {
    const { codePrisma, codePostgres, contrainte } = diagnostiquer(erreur);
    this.logger.error(
      `Import des clients annulé (RG29) : erreur de la base, Prisma ${codePrisma ?? 'inconnu'}, ` +
        `PostgreSQL ${codePostgres ?? 'inconnu'}, contrainte ${contrainte ?? 'aucune'}`,
    );
    return new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

// ---------- Enregistrement, dans la transaction et sous le verrou ----------

/**
 * Les doublons sont relus après le verrou : les décisions de l'aperçu ne servent pas. Les créations
 * passent d'abord ; les clients à mettre à jour ne sont verrouillés qu'ensuite, pour que leurs
 * verrous de ligne (qui bloquent une modification depuis la fiche) durent le moins possible.
 */
async function importerLesLignes(
  operations: OperationsDImport,
  fichier: FichierPrepare,
  strategie: StrategieDoublons,
): Promise<RapportImport> {
  const existants = await operations.trouverClientsCorrespondants(clesDeRecherche(fichier));
  const analysees = analyserLignes(fichier.lignes, existants);
  const lignes: LigneImportee[] = [];
  const aMettreAJour: { rang: number; doublon: Doublon }[] = [];
  for (const [rang, ligne] of analysees.entries()) {
    if (ligne.resultat === 'DOUBLON' && strategie === 'METTRE_A_JOUR' && !ligne.clientArchive) {
      aMettreAJour.push({ rang, doublon: ligne });
    } else {
      lignes[rang] = await enregistrerSansMiseAJour(operations, ligne);
    }
  }
  if (aMettreAJour.length > 0) {
    const identifiants = [...new Set(aMettreAJour.map(({ doublon }) => doublon.clientId))];
    const clients = await operations.verrouillerClients(identifiants);
    const parIdentifiant = new Map(clients.map((client) => [client.id, client]));
    for (const { rang, doublon } of aMettreAJour) {
      lignes[rang] = await mettreAJour(operations, parIdentifiant.get(doublon.clientId), doublon);
    }
  }
  return { totaux: compter(lignes), lignes };
}

async function enregistrerSansMiseAJour(
  operations: OperationsDImport,
  ligne: LigneAnalysee,
): Promise<LigneImportee> {
  switch (ligne.resultat) {
    case 'INVALIDE':
      return { numero: ligne.numero, resultat: 'REJETE', erreurs: ligne.erreurs };
    case 'VALIDE':
      return {
        numero: ligne.numero,
        resultat: 'CREE',
        clientId: await operations.creerClient(ligne.client),
      };
    case 'DOUBLON':
      // Un client archivé n'est jamais touché, quelle que soit la stratégie (RG28).
      return {
        numero: ligne.numero,
        resultat: 'IGNORE',
        clientId: ligne.clientId,
        motif: ligne.motif,
      };
  }
}

/**
 * RG28 : seuls les champs renseignés de la ligne remplacent ceux du client (une cellule vide ne
 * vide rien) ; le type ne change que s'il est dans le fichier ; la règle nom / raison sociale est
 * vérifiée sur le client mis à jour ; une adresse nouvelle est ajoutée, aucune n'est modifiée.
 */
async function mettreAJour(
  operations: OperationsDImport,
  client: ClientAMettreAJour | undefined,
  doublon: Doublon,
): Promise<LigneImportee> {
  if (client === undefined || client.archive) {
    // Archivé entre l'analyse et le verrou de sa ligne : il reste intact.
    return {
      numero: doublon.numero,
      resultat: 'IGNORE',
      clientId: doublon.clientId,
      motif: MOTIF_CLIENT_ARCHIVE,
    };
  }
  const modification = champsModifies(client, doublon);
  try {
    verifierIdentite({ ...client, ...modification });
  } catch (erreur) {
    if (erreur instanceof BadRequestException) {
      return { numero: doublon.numero, resultat: 'REJETE', erreurs: messagesDe(erreur) };
    }
    throw erreur;
  }
  if (Object.keys(modification).length > 0) {
    await operations.modifierClient(client.id, modification);
    Object.assign(client, modification);
  }
  await ajouterLAdresseSiNouvelle(operations, client, doublon.client.adresse);
  return { numero: doublon.numero, resultat: 'MIS_A_JOUR', clientId: client.id };
}

/** Champs non vides de la ligne qui diffèrent du client. */
function champsModifies(client: ClientAMettreAJour, doublon: Doublon): Partial<IdentiteClient> {
  const { typeClient, nomClient, prenomClient, raisonSociale, telephone, emailClient } =
    doublon.client;
  const proposes: Partial<IdentiteClient> = {
    ...(doublon.typeRenseigne ? { typeClient } : {}),
    ...(nomClient === null ? {} : { nomClient }),
    ...(prenomClient === null ? {} : { prenomClient }),
    ...(raisonSociale === null ? {} : { raisonSociale }),
    telephone,
    ...(emailClient === null ? {} : { emailClient }),
  };
  return Object.fromEntries(
    Object.entries(proposes).filter(
      ([champ, valeur]) => client[champ as keyof IdentiteClient] !== valeur,
    ),
  );
}

/** Même rue, code postal et ville, sans tenir compte de la casse ni des espaces en trop. */
async function ajouterLAdresseSiNouvelle(
  operations: OperationsDImport,
  client: ClientAMettreAJour,
  adresse: NouvelleAdresse,
): Promise<void> {
  const cle = cleDAdresse(adresse);
  if (client.adresses.some((connue) => cleDAdresse(connue) === cle)) {
    return;
  }
  await operations.ajouterAdresse(client.id, adresse);
  client.adresses.push(adresse);
}

function cleDAdresse({ rue, codePostal, ville }: ClientAMettreAJour['adresses'][number]): string {
  return [rue, codePostal, ville]
    .map((morceau) => morceau.trim().replace(/\s+/g, ' ').toLowerCase())
    .join('|');
}

function messagesDe(erreur: BadRequestException): string[] {
  const { message } = erreur.getResponse() as { message: string | string[] };
  return Array.isArray(message) ? message : [message];
}

function compter(lignes: readonly LigneImportee[]): RapportImport['totaux'] {
  const nombre = (resultat: LigneImportee['resultat']) =>
    lignes.filter((ligne) => ligne.resultat === resultat).length;
  return {
    crees: nombre('CREE'),
    misAJour: nombre('MIS_A_JOUR'),
    ignores: nombre('IGNORE'),
    rejetes: nombre('REJETE'),
  };
}
