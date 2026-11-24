import type { Adresse } from '../generated/prisma/client.ts';
import { nomAffiche } from '../tournees/tournees.presentation.js';
import type { ClientAvecAdresses } from './clients.repository.js';
import type { AdresseApi, ClientApi } from './clients.types.js';

/*
 * Mise en forme des réponses selon le contrat d'API (section 6.5) : seuls les champs prévus
 * sortent de l'API, jamais une ligne Prisma telle quelle.
 */

export function versClientApi(client: ClientAvecAdresses): ClientApi {
  return {
    id: client.id,
    typeClient: client.typeClient,
    nomClient: client.nomClient,
    prenomClient: client.prenomClient,
    raisonSociale: client.raisonSociale,
    nomAffiche: nomAffiche(client),
    telephone: client.telephone,
    emailClient: client.emailClient,
    archive: client.archive,
    archiveLe: client.archiveLe,
    creeLe: client.creeLe,
    majLe: client.majLe,
    adresses: client.adresses.map(versAdresseApi),
  };
}

export function versAdresseApi(adresse: Adresse): AdresseApi {
  return {
    id: adresse.id,
    rue: adresse.rue,
    complement: adresse.complement,
    codePostal: adresse.codePostal,
    ville: adresse.ville,
    infosAcces: adresse.infosAcces,
    archive: adresse.archive,
    archiveLe: adresse.archiveLe,
  };
}
