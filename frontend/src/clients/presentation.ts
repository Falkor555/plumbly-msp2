import type { Adresse, Client, TriClients, TypeClient } from '../api/types';

export const LIBELLES_TYPE_CLIENT: Record<TypeClient, string> = {
  PARTICULIER: 'Particulier',
  PROFESSIONNEL: 'Professionnel',
};

/** Même gabarit que les badges du planning (BadgesIntervention). */
export const BADGE =
  'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset';

export const CLASSES_TYPE_CLIENT: Record<TypeClient, string> = {
  PARTICULIER: 'bg-white text-gris-texte ring-bordure',
  PROFESSIONNEL: 'bg-sarcelle-claire text-sarcelle-profonde ring-sarcelle/20',
};

/** Gris neutre, comme une intervention annulée : la fiche n'est plus active mais reste lisible. */
export const CLASSES_ARCHIVE = 'bg-gray-100 text-gris-texte ring-bordure';

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
 * « 0692 12 34 56 » pour « 0692123456 », la forme que l'API enregistre (10 chiffres). Un numéro
 * d'une autre forme est rendu tel quel plutôt que d'être déformé.
 */
export function telephoneLisible(telephone: string): string {
  if (!/^\d{10}$/.test(telephone)) return telephone;
  return `${telephone.slice(0, 4)} ${telephone.slice(4).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
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
