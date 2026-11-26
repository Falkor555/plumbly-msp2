import { urlApi } from './msw/serveur';

type Methode = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Appelle une route simulée telle que le navigateur le ferait (fetch brut, corps JSON), pour
 * tester un handler MSW sans passer par la couche API du front. Le jeton, s'il est donné, part
 * dans l'en-tête Authorization comme le fait clientHttp.
 */
export function appeler(
  methode: Methode,
  chemin: string,
  corps?: unknown,
  { jeton }: { jeton?: string } = {},
): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' });
  if (corps !== undefined) headers.set('Content-Type', 'application/json');
  if (jeton !== undefined) headers.set('Authorization', `Bearer ${jeton}`);
  return fetch(urlApi(chemin), {
    method: methode,
    headers,
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
}

/** Statut et corps JSON décodé d'une réponse, pour une assertion en une fois. */
export async function statutEtCorps(
  reponse: Response,
): Promise<{ statut: number; corps: unknown }> {
  return { statut: reponse.status, corps: await reponse.json() };
}
