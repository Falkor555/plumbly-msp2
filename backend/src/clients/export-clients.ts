import type { CelluleCsv } from '../commun/csv/ecrire-csv.js';
import { jourMetier } from '../commun/fuseau-metier.js';
import type { Adresse } from '../generated/prisma/client.ts';
import type { ClientAvecAdresses } from './clients.repository.js';

/*
 * Lignes de GET /clients/export (US32, docs/api.md section 6.12). Les noms de colonnes sont ceux
 * que l'import reconnaît (US31) : un export réimporté sans modification ne crée aucun client.
 */

export const COLONNES_EXPORT_CLIENTS = [
  'id',
  'type_client',
  'nom',
  'prenom',
  'raison_sociale',
  'telephone',
  'email',
  'rue',
  'complement',
  'code_postal',
  'ville',
  'infos_acces',
  'archive',
  'cree_le',
] as const;

/**
 * Une ligne par adresse non archivée, dans l'ordre de la liste puis des adresses. Un client sans
 * adresse non archivée sort sur une ligne aux colonnes d'adresse vides : il n'est pas perdu.
 * Les clients doivent être chargés avec leurs seules adresses actives (ClientsRepository.rechercher).
 */
export function versLignesCsvClients(clients: readonly ClientAvecAdresses[]): CelluleCsv[][] {
  return clients.flatMap((client) =>
    client.adresses.length === 0
      ? [versLigne(client, null)]
      : client.adresses.map((adresse) => versLigne(client, adresse)),
  );
}

function versLigne(client: ClientAvecAdresses, adresse: Adresse | null): CelluleCsv[] {
  return [
    client.id,
    client.typeClient,
    client.nomClient,
    client.prenomClient,
    client.raisonSociale,
    client.telephone,
    client.emailClient,
    adresse?.rue ?? null,
    adresse?.complement ?? null,
    adresse?.codePostal ?? null,
    adresse?.ville ?? null,
    adresse?.infosAcces ?? null,
    client.archive ? 'oui' : 'non',
    jourMetier(client.creeLe),
  ];
}
