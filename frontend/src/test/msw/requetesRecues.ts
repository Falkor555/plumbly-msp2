import { http } from 'msw';
import { serveurApi, urlApi } from './serveur';

export interface RequeteRecue {
  methode: string;
  url: URL;
  /** Corps brut ; '' quand la requête n'en a pas. */
  corps: string;
  enTetes: Headers;
}

type MethodeSimulee = 'get' | 'post' | 'patch' | 'delete';

/**
 * Simule une route et garde chaque requête reçue, pour vérifier ce que la couche API envoie :
 * chemin, paramètres d'URL et corps JSON.
 */
export function enregistrerLesRequetes(
  methode: MethodeSimulee,
  chemin: string,
  fabriquerReponse: () => Response,
): RequeteRecue[] {
  const recues: RequeteRecue[] = [];
  serveurApi.use(
    http[methode](urlApi(chemin), async ({ request }) => {
      recues.push({
        methode: request.method,
        url: new URL(request.url),
        corps: await request.text(),
        enTetes: request.headers,
      });
      return fabriquerReponse();
    }),
  );
  return recues;
}

/** Paramètres d'URL de la requête, décodés, sous forme d'objet simple. */
export function parametresRecus(requete: RequeteRecue | undefined): Record<string, string> {
  return Object.fromEntries(requete?.url.searchParams ?? []);
}
