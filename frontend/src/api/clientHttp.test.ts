import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './clientHttp';
import { ErreurApi, ErreurReseau } from './erreurs';
import {
  effacerJetonAcces,
  enregistrerJetonAcces,
  lireJetonAcces,
  surSessionExpiree,
} from './jetonAcces';

function reponseJson(statut: number, corps?: unknown): Response {
  return new Response(corps === undefined ? null : JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Définie dans vitest.config.ts : une URL absolue, comme l'exige fetch sous Node.
const URL_API = import.meta.env.VITE_API_URL;

const fetchSimule = vi.fn<typeof fetch>();

function enTeteEnvoye(appel: number, nom: string): string | null {
  const init = fetchSimule.mock.calls[appel]?.[1];
  return new Headers(init?.headers).get(nom);
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchSimule);
  effacerJetonAcces();
});

afterEach(() => {
  fetchSimule.mockReset();
  vi.unstubAllGlobals();
});

describe('clientHttp', () => {
  it('envoie le jeton d’accès dans l’en-tête Authorization', async () => {
    enregistrerJetonAcces('jeton-valide');
    fetchSimule.mockResolvedValueOnce(reponseJson(200, []));

    await api.get('/clients');

    expect(enTeteEnvoye(0, 'Authorization')).toBe('Bearer jeton-valide');
  });

  it('n’envoie pas le jeton sur une route publique', async () => {
    enregistrerJetonAcces('jeton-valide');
    fetchSimule.mockResolvedValueOnce(reponseJson(200, { accessToken: 'x', utilisateur: {} }));

    await api.post('/auth/login', { email: 'a@b.fr', motDePasse: 'secret' }, { publique: true });

    expect(enTeteEnvoye(0, 'Authorization')).toBeNull();
  });

  it('ignore les paramètres vides dans l’URL', async () => {
    fetchSimule.mockResolvedValueOnce(reponseJson(200, []));

    await api.get('/clients', {
      parametres: { recherche: '', page: 1, ville: undefined, actif: null },
    });

    expect(fetchSimule.mock.calls[0]?.[0]).toBe(`${URL_API}/clients?page=1`);
  });

  it('encode les caractères spéciaux de la recherche', async () => {
    fetchSimule.mockResolvedValueOnce(reponseJson(200, []));

    await api.get('/clients', { parametres: { recherche: "' OR 1=1 --" } });

    expect(fetchSimule.mock.calls[0]?.[0]).toBe(`${URL_API}/clients?recherche=%27+OR+1%3D1+--`);
  });

  it('renvoie undefined pour une réponse 204', async () => {
    fetchSimule.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(api.delete('/technicians/1/unavailabilities/2')).resolves.toBeUndefined();
  });

  it('renouvelle le jeton sur un 401 puis rejoue la requête', async () => {
    enregistrerJetonAcces('jeton-expire');
    fetchSimule
      .mockResolvedValueOnce(reponseJson(401, { statusCode: 401, message: 'Unauthorized' }))
      .mockResolvedValueOnce(reponseJson(200, { accessToken: 'jeton-neuf' }))
      .mockResolvedValueOnce(reponseJson(200, { id: 7 }));

    const client = await api.get<{ id: number }>('/clients/7');

    expect(client).toEqual({ id: 7 });
    expect(fetchSimule.mock.calls[1]?.[0]).toBe(`${URL_API}/auth/refresh`);
    expect(enTeteEnvoye(2, 'Authorization')).toBe('Bearer jeton-neuf');
  });

  it('ne demande qu’un seul renouvellement pour plusieurs 401 simultanés', async () => {
    enregistrerJetonAcces('jeton-expire');
    fetchSimule.mockImplementation(async (url) => {
      if (String(url).endsWith('/auth/refresh'))
        return reponseJson(200, { accessToken: 'jeton-neuf' });
      return lireJetonAcces() === 'jeton-neuf' ? reponseJson(200, []) : reponseJson(401);
    });

    await Promise.all([api.get('/clients'), api.get('/technicians')]);

    const appelsRefresh = fetchSimule.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/refresh'),
    );
    expect(appelsRefresh).toHaveLength(1);
  });

  it('termine la session si le renouvellement est refusé', async () => {
    enregistrerJetonAcces('jeton-expire');
    const surExpiration = vi.fn();
    const desabonner = surSessionExpiree(surExpiration);
    fetchSimule.mockResolvedValueOnce(reponseJson(401)).mockResolvedValueOnce(reponseJson(401));

    await expect(api.get('/clients')).rejects.toMatchObject({ statut: 401 });

    expect(surExpiration).toHaveBeenCalledOnce();
    expect(lireJetonAcces()).toBeNull();
    desabonner();
  });

  it('expose le message métier d’un conflit de planning', async () => {
    fetchSimule.mockResolvedValueOnce(
      reponseJson(409, {
        statusCode: 409,
        message: 'Le créneau chevauche une autre intervention',
        error: 'Conflict',
      }),
    );

    const erreur = await api.post('/tours/3/interventions', {}).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ErreurApi);
    expect((erreur as ErreurApi).messagePourUtilisateur()).toBe(
      'Le créneau chevauche une autre intervention',
    );
  });

  it('remplace le message serveur par un texte générique sur un 403', async () => {
    fetchSimule.mockResolvedValueOnce(
      reponseJson(403, { statusCode: 403, message: 'Role TECHNICIEN not in [ADMIN]' }),
    );

    const erreur = (await api.get('/clients').catch((e: unknown) => e)) as ErreurApi;

    expect(erreur.messagePourUtilisateur()).toBe(
      "Vous n'avez pas les droits pour effectuer cette action.",
    );
  });

  it('gère un corps d’erreur non JSON', async () => {
    fetchSimule.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));

    await expect(api.get('/clients')).rejects.toMatchObject({ statut: 502, messagesServeur: [] });
  });

  it('transforme une panne réseau en ErreurReseau', async () => {
    fetchSimule.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(api.get('/tours/me')).rejects.toBeInstanceOf(ErreurReseau);
  });

  it('laisse passer une annulation volontaire', async () => {
    fetchSimule.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    await expect(api.get('/clients')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
