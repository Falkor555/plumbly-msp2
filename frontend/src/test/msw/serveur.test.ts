import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { serveurApi, urlApi } from './serveur';

describe("simulation de l'API avec MSW", () => {
  it('renvoie la réponse simulée pour une route déclarée', async () => {
    serveurApi.use(
      http.get(urlApi('/clients'), () => HttpResponse.json([{ id: 1, nom: 'Hoarau' }])),
    );

    const reponse = await fetch(urlApi('/clients'));

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual([{ id: 1, nom: 'Hoarau' }]);
  });

  it("bloque une requête vers une route qu'aucun handler ne simule, sans aller sur le réseau", async () => {
    const consoleErreur = vi.spyOn(console, 'error').mockImplementation(() => {});

    const requete = fetch(urlApi('/route-inconnue'));

    // La cause vient de MSW : la requête n'a pas tenté de joindre un vrai serveur.
    await expect(requete).rejects.toMatchObject({
      cause: { message: expect.stringContaining('[MSW]') },
    });
    expect(consoleErreur).toHaveBeenCalledWith(expect.stringContaining('/route-inconnue'));
  });
});
