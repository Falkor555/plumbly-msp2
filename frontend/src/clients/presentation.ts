import type { Adresse, Client, TriClients, TypeClient } from '../api/types';

export const LIBELLES_TYPE_CLIENT: Record<TypeClient, string> = {
  PARTICULIER: 'Particulier',
  PROFESSIONNEL: 'Professionnel',
};

export const CLASSES_TYPE_CLIENT: Record<TypeClient, string> = {
  PARTICULIER: 'bg-white text-gris-texte ring-bordure',
  PROFESSIONNEL: 'bg-sarcelle-claire text-sarcelle-profonde ring-sarcelle/20',
};

/** Tris acceptés par GET /clients (backend/src/clients/clients.types.ts), dans l'ordre du menu. */
export const OPTIONS_TRI_CLIENTS: { valeur: TriClients; libelle: string }[] = [
  { valeur: 'nomAffiche', libelle: 'Nom, de A à Z' },
  { valeur: '-nomAffiche', libelle: 'Nom, de Z à A' },
  { valeur: '-creeLe', libelle: 'Les plus récents d’abord' },
  { valeur: 'creeLe', libelle: 'Les plus anciens d’abord' },
];

/** « 1 client », « 12 clients ». */
export function nombreDeClients(nombre: number): string {
  return `${nombre} client${nombre > 1 ? 's' : ''}`;
}

/**
 * Ville de la première adresse en service, ou null s'il n'y en a pas. La liste ne renvoie que les
 * adresses en service, la fiche toutes : le filtre sert aux deux.
 */
export function villePrincipale(client: Pick<Client, 'adresses'>): string | null {
  return client.adresses.find((adresse) => !adresse.archive)?.ville ?? null;
}

/**
 * Rubriques d'identité de la fiche, selon le type : nom et prénom d'un particulier, raison
 * sociale d'un professionnel et, s'il est connu, le nom de la personne à contacter. Une valeur
 * null n'a pas été renseignée.
 */
export function identiteDuClient(
  client: Pick<Client, 'typeClient' | 'nomClient' | 'prenomClient' | 'raisonSociale'>,
): { titre: string; valeur: string | null }[] {
  if (client.typeClient === 'PARTICULIER') {
    return [
      { titre: 'Nom', valeur: client.nomClient },
      { titre: 'Prénom', valeur: client.prenomClient },
    ];
  }
  const contact = [client.prenomClient, client.nomClient].filter(Boolean).join(' ');
  return [
    { titre: 'Raison sociale', valeur: client.raisonSociale },
    { titre: 'Contact', valeur: contact || null },
  ];
}

/** Adresses en service et adresses archivées, chacune dans l'ordre de l'API. */
export function separerAdresses(adresses: Adresse[]): {
  enService: Adresse[];
  archivees: Adresse[];
} {
  return {
    enService: adresses.filter((adresse) => !adresse.archive),
    archivees: adresses.filter((adresse) => adresse.archive),
  };
}

/** « 12 rue des Lilas, 97400 Saint-Denis » ; le complément et l'accès sont montrés à part. */
export function adresseSurUneLigne(adresse: Pick<Adresse, 'rue' | 'codePostal' | 'ville'>): string {
  return `${adresse.rue}, ${adresse.codePostal} ${adresse.ville}`;
}
