import { http, HttpResponse } from 'msw';
import type { Adresse, Client, Intervention, ListePaginee } from '../api/types';
import { fabriquerIntervention, planifier } from '../simulation/donneesDemonstration';
import { serveurApi, urlApi } from './msw/serveur';

/*
 * Clients de test réunionnais, aux noms accentués pour vérifier qu'une recherche sans accent les
 * retrouve (US08). Chaque appel rend des objets neufs : un test peut les modifier sans toucher
 * les autres.
 */

const CREATION = '2026-11-20T06:00:00.000Z';

export function fabriquerAdresse(surcharge: Partial<Adresse> & Pick<Adresse, 'id'>): Adresse {
  return {
    rue: `${surcharge.id} rue des Flamboyants`,
    complement: null,
    codePostal: '97400',
    ville: 'Saint-Denis',
    infosAcces: null,
    archive: false,
    archiveLe: null,
    ...surcharge,
  };
}

type DescriptionClient = Partial<Client> & Pick<Client, 'id' | 'nomAffiche'>;

export function fabriquerClient(surcharge: DescriptionClient): Client {
  return {
    typeClient: 'PARTICULIER',
    nomClient: null,
    prenomClient: null,
    raisonSociale: null,
    telephone: '0692000000',
    emailClient: null,
    archive: false,
    archiveLe: null,
    creeLe: CREATION,
    majLe: CREATION,
    adresses: [fabriquerAdresse({ id: surcharge.id * 10 })],
    ...surcharge,
  };
}

export function heleneDeTest(): Client {
  return fabriquerClient({
    id: 7,
    nomClient: 'Payet',
    prenomClient: 'Hélène',
    nomAffiche: 'Hélène Payet',
    telephone: '0692123456',
    emailClient: 'helene.payet@exemple.re',
    adresses: [
      fabriquerAdresse({
        id: 70,
        rue: '12 rue des Lilas',
        complement: 'Bât. B',
        ville: 'Saint-Denis',
        infosAcces: 'Code 4521, 3e étage',
      }),
      fabriquerAdresse({
        id: 71,
        rue: '3 chemin des Tamarins',
        codePostal: '97430',
        ville: 'Le Tampon',
      }),
    ],
  });
}

/** Cinq clients en service, dans l'ordre alphabétique de nomAffiche, puis un client archivé. */
export function clientsDeTest(): Client[] {
  return [
    fabriquerClient({
      id: 3,
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Boulangerie Técher',
      nomAffiche: 'Boulangerie Técher',
      telephone: '0262414243',
      adresses: [fabriquerAdresse({ id: 30, codePostal: '97470', ville: 'Saint-Benoît' })],
    }),
    fabriquerClient({
      id: 4,
      nomClient: 'Hoarau',
      prenomClient: 'Gérard',
      nomAffiche: 'Gérard Hoarau',
      telephone: '0693445566',
      adresses: [fabriquerAdresse({ id: 40, codePostal: '97410', ville: 'Saint-Pierre' })],
    }),
    heleneDeTest(),
    fabriquerClient({
      id: 5,
      nomClient: 'Grondin',
      prenomClient: 'Josiane',
      nomAffiche: 'Josiane Grondin',
      adresses: [fabriquerAdresse({ id: 50, codePostal: '97440', ville: 'Saint-André' })],
    }),
    fabriquerClient({
      id: 6,
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Résidence Les Filaos',
      nomAffiche: 'Résidence Les Filaos',
      telephone: '0262223344',
      adresses: [fabriquerAdresse({ id: 60, codePostal: '97460', ville: 'Saint-Paul' })],
    }),
    fabriquerClient({
      id: 8,
      nomClient: 'Nativel',
      prenomClient: 'Émile',
      nomAffiche: 'Émile Nativel',
      archive: true,
      archiveLe: '2026-11-22T06:00:00.000Z',
      adresses: [fabriquerAdresse({ id: 80, codePostal: '97420', ville: 'Le Port' })],
    }),
  ];
}

/** Intervention de l'historique d'Hélène Payet (client 7), à l'adresse 70 par défaut. */
export function interventionDeHelene(
  id: number,
  type: string,
  surcharge: Partial<Intervention> = {},
): Intervention {
  const intervention = fabriquerIntervention({
    id,
    client: 'Hélène Payet',
    type,
    ville: 'Saint-Denis',
    dureeEstimeeMin: 60,
  });
  return {
    ...intervention,
    adresse: { ...intervention.adresse, id: 70, rue: '12 rue des Lilas', complement: 'Bât. B' },
    client: { ...intervention.client, id: 7, telephone: '0692123456' },
    ...surcharge,
  };
}

/** Intervention planifiée dans la tournée de Jean Rivière ce jour-là. */
export function interventionPlanifieeDeHelene(
  id: number,
  type: string,
  jour: string,
  heure: string,
): Intervention {
  return {
    ...planifier(interventionDeHelene(id, type), jour, heure, 1),
    tournee: { id: 10, dateTournee: jour, technicien: { id: 1, nom: 'Rivière', prenom: 'Jean' } },
  };
}

export function listePaginee<T>(
  data: T[],
  meta: Partial<ListePaginee<T>['meta']> = {},
): ListePaginee<T> {
  return { data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1, ...meta } };
}

function sansAccent(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function correspond(client: Client, parametres: URLSearchParams): boolean {
  const recherche = parametres.get('recherche');
  const type = parametres.get('typeClient');
  if (parametres.get('archives') !== 'true' && client.archive) return false;
  if (type && client.typeClient !== type) return false;
  return !recherche || sansAccent(client.nomAffiche).includes(sansAccent(recherche));
}

/**
 * Simule GET /clients sur ces clients (recherche sans accent sur le nom, type, archivés, page) et
 * garde les paramètres de chaque requête reçue. Le tri n'est pas simulé : l'ordre reste celui
 * du tableau.
 */
export function servirLesClients(clients: Client[]): URLSearchParams[] {
  const recues: URLSearchParams[] = [];
  serveurApi.use(
    http.get(urlApi('/clients'), ({ request }) => {
      const parametres = new URL(request.url).searchParams;
      recues.push(parametres);
      const retenus = clients.filter((client) => correspond(client, parametres));
      const page = Number(parametres.get('page') ?? 1);
      const limit = Number(parametres.get('limit') ?? 20);
      return HttpResponse.json(
        listePaginee(retenus.slice((page - 1) * limit, page * limit), {
          page,
          limit,
          total: retenus.length,
          totalPages: Math.ceil(retenus.length / limit),
        }),
      );
    }),
  );
  return recues;
}
