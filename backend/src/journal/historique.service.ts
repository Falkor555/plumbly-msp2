import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Role } from '../generated/prisma/client.ts';
import { HistoriqueRepository, type NomAuteur } from './historique.repository.js';
import { JournalDesActions } from './journal-des-actions.js';
import {
  type DocumentJournal,
  type DonneesJournal,
  JournalIndisponible,
  type TypeAction,
} from './journal.types.js';

/*
 * Une intervention compte normalement moins de dix entrées ; la limite borne la réponse si des
 * planifications et des retraits se répètent. Ce sont les plus récentes qui sont gardées.
 */
export const NOMBRE_MAXIMUM_ENTREES_HISTORIQUE = 100;

/** Entrée de GET /interventions/:id/history (contrat d'API, section 6.3). */
export interface EntreeHistoriqueApi {
  date: string;
  action: TypeAction;
  /** nom et prenom à null si le compte n'existe plus dans PostgreSQL. */
  auteur: { id: number; nom: string | null; prenom: string | null; role: Role } | null;
  avant?: DonneesJournal;
  apres?: DonneesJournal;
  contexte?: DonneesJournal;
}

/** US19 : historique des statuts d'une intervention, lu dans le journal des actions. */
@Injectable()
export class HistoriqueService {
  constructor(
    private readonly depot: HistoriqueRepository,
    private readonly journal: JournalDesActions,
  ) {}

  async historiqueDeLIntervention(idIntervention: number): Promise<EntreeHistoriqueApi[]> {
    if (!(await this.depot.interventionExiste(idIntervention))) {
      throw new NotFoundException('Intervention introuvable.');
    }
    const entrees = await this.lireJournal(idIntervention);
    const noms = await this.depot.trouverNomsDesAuteurs(idsDesAuteurs(entrees));
    return entrees.toSorted(duPlusRecentAuPlusAncien).map((entree) => versEntreeApi(entree, noms));
  }

  /** Une liste vide ferait croire à une intervention sans historique : MongoDB absent, 503. */
  private async lireJournal(idIntervention: number): Promise<DocumentJournal[]> {
    try {
      return await this.journal.historiqueDe(
        { type: 'intervention', id: idIntervention },
        NOMBRE_MAXIMUM_ENTREES_HISTORIQUE,
      );
    } catch (erreur) {
      if (erreur instanceof JournalIndisponible) {
        throw new ServiceUnavailableException(
          'Historique temporairement indisponible : réessayer dans quelques instants.',
          { cause: erreur },
        );
      }
      throw erreur;
    }
  }
}

function idsDesAuteurs(entrees: DocumentJournal[]): number[] {
  const ids = entrees.flatMap((entree) => (entree.auteur === undefined ? [] : [entree.auteur.id]));
  return [...new Set(ids)];
}

/**
 * Le journal renvoie déjà cet ordre ; le service le garantit lui-même, car c'est une règle du
 * contrat d'API et pas un détail du stockage. Le tri est stable : à date égale, l'ordre du
 * journal (insertion la plus récente d'abord) est conservé.
 */
function duPlusRecentAuPlusAncien(a: DocumentJournal, b: DocumentJournal): number {
  return b.date.getTime() - a.date.getTime();
}

/** Format du contrat : ni _id ni entite, l'auteur complété par son nom. */
function versEntreeApi(entree: DocumentJournal, noms: NomAuteur[]): EntreeHistoriqueApi {
  const { date, action, auteur, avant, apres, contexte } = entree;
  const nom = auteur === undefined ? undefined : noms.find((candidat) => candidat.id === auteur.id);
  return {
    date: date.toISOString(),
    action,
    auteur:
      auteur === undefined
        ? null
        : { id: auteur.id, nom: nom?.nom ?? null, prenom: nom?.prenom ?? null, role: auteur.role },
    ...(avant === undefined ? {} : { avant }),
    ...(apres === undefined ? {} : { apres }),
    ...(contexte === undefined ? {} : { contexte }),
  };
}
