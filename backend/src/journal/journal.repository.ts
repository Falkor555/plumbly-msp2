import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Collection, type IndexDescription, MongoError } from 'mongodb';
import { verifierClesSures } from './cles-mongodb.js';
import { ConnexionMongoDb } from './connexion-mongodb.js';
import {
  type DocumentJournal,
  type EntiteConsultee,
  JournalIndisponible,
  type TypeAction,
} from './journal.types.js';

const NOM_COLLECTION = 'journal_actions';

/*
 * Durée de conservation des journaux de connexion : 6 mois, le bas de la fourchette de 6 mois à
 * 1 an recommandée par la CNIL. MongoDB supprime lui-même les documents expirés (index TTL).
 * L'historique des statuts et des comptes n'expire pas : il répond à US19 et RG07.
 */
export const DUREE_CONSERVATION_CONNEXIONS_EN_SECONDES = 183 * 24 * 60 * 60;
const ACTIONS_DE_CONNEXION: TypeAction[] = ['CONNEXION_REUSSIE', 'CONNEXION_ECHOUEE'];

/** Index de docs/modele-donnees.md, section 8.3. Nommés : createIndexes est rejouable. */
export const INDEX_DU_JOURNAL: IndexDescription[] = [
  { name: 'historique_entite', key: { 'entite.type': 1, 'entite.id': 1, date: -1 } },
  { name: 'actions_auteur', key: { 'auteur.id': 1, date: -1 } },
  { name: 'suivi_actions', key: { action: 1, date: -1 } },
  {
    name: 'expiration_connexions',
    key: { date: 1 },
    expireAfterSeconds: DUREE_CONSERVATION_CONNEXIONS_EN_SECONDES,
    partialFilterExpression: { action: { $in: ACTIONS_DE_CONNEXION } },
  },
];

/**
 * Seul accès à la collection journal_actions. Les filtres sont construits ici, avec des valeurs
 * typées (type d'entité littéral, identifiant entier) : aucune donnée de requête HTTP n'y entre.
 */
@Injectable()
export class JournalRepository implements OnModuleInit {
  private readonly logger = new Logger(JournalRepository.name);
  private indexCrees = false;

  constructor(private readonly connexion: ConnexionMongoDb) {}

  /** MongoDB éteint au démarrage : l'API démarre quand même, avec un avertissement. */
  async onModuleInit(): Promise<void> {
    await this.creerIndexSiNecessaire();
  }

  async inserer(document: DocumentJournal): Promise<void> {
    verifierClesSures(document);
    // Copie : insertOne ajoute _id à l'objet reçu.
    await this.collection().insertOne({ ...document });
    // MongoDB était peut-être éteint au démarrage : les index sont créés dès qu'il répond.
    await this.creerIndexSiNecessaire();
  }

  /** Entrées de l'entité, de la plus récente à la plus ancienne ; _id départage les égalités. */
  async listerPourEntite(entite: EntiteConsultee, limite: number): Promise<DocumentJournal[]> {
    try {
      return await this.collection()
        .find(
          { 'entite.type': entite.type, 'entite.id': entite.id },
          { projection: { _id: 0 }, sort: { date: -1, _id: -1 }, limit: limite },
        )
        .toArray();
    } catch (erreur) {
      if (erreur instanceof MongoError) {
        throw new JournalIndisponible({ cause: erreur });
      }
      throw erreur;
    }
  }

  private async creerIndexSiNecessaire(): Promise<void> {
    if (this.indexCrees) {
      return;
    }
    try {
      await this.collection().createIndexes(INDEX_DU_JOURNAL);
      this.indexCrees = true;
    } catch (erreur) {
      this.logger.warn(
        `MongoDB injoignable : index du journal non créés, nouvel essai à la prochaine écriture (${decrire(erreur)}).`,
      );
    }
  }

  private collection(): Collection<DocumentJournal> {
    return this.connexion.base().collection<DocumentJournal>(NOM_COLLECTION);
  }
}

function decrire(erreur: unknown): string {
  return erreur instanceof Error ? `${erreur.name}: ${erreur.message}` : String(erreur);
}
