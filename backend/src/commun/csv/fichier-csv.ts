import { BadRequestException, StreamableFile } from '@nestjs/common';
import { jourMetier } from '../fuseau-metier.js';

/*
 * Règles communes aux exports CSV (RG26, docs/api.md section 6.12) : limite de lignes, nom du
 * fichier et réponse HTTP.
 */

/** Au-delà, l'export est refusé : le fichier construit en mémoire reste sous 1 Mo (ADR 0014). */
export const LIMITE_DE_LIGNES_EXPORT = 5000;

export type RessourceExportee = 'clients' | 'interventions';

export interface FichierCsv {
  nom: string;
  contenu: string;
}

/** Lève le 400 du contrat si le nombre de lignes (ou d'éléments lus) dépasse la limite. */
export function verifierLimiteExport(nombre: number): void {
  if (nombre > LIMITE_DE_LIGNES_EXPORT) {
    throw new BadRequestException('L’export dépasse 5 000 lignes : affinez les filtres.');
  }
}

/** clients-2026-11-25.csv : le jour est celui de La Réunion, pas celui du serveur en UTC. */
export function nomDuFichierCsv(ressource: RessourceExportee, instant: Date): string {
  return `${ressource}-${jourMetier(instant)}.csv`;
}

/**
 * Réponse de téléchargement. StreamableFile n'accepte qu'un Buffer ou un flux : le texte est
 * encodé en UTF-8, BOM compris. Nest ne pose Content-Type et Content-Disposition que s'ils
 * manquent, et calcule Content-Length sur le Buffer.
 */
export function versReponseCsv({ nom, contenu }: FichierCsv): StreamableFile {
  return new StreamableFile(Buffer.from(contenu, 'utf8'), {
    type: 'text/csv; charset=utf-8',
    disposition: `attachment; filename="${nom}"`,
  });
}
