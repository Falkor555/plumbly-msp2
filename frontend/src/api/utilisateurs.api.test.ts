import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { listePaginee } from '../test/clientsDeTest';
import { enregistrerLesRequetes, parametresRecus } from '../test/msw/requetesRecues';
import { fabriquerCompte } from '../test/techniciensDeTest';
import { ErreurApi } from './erreurs';
import { utilisateursApi } from './utilisateurs.api';

describe('liste des comptes utilisateurs', () => {
  it('US11 : envoie le rôle, l’état, le tri et la page, et rend les comptes reçus', async () => {
    const recues = enregistrerLesRequetes('get', '/users', () =>
      HttpResponse.json(listePaginee([fabriquerCompte({ id: 14, nom: 'Roche', prenom: 'Julie' })])),
    );

    const page = await utilisateursApi.lister({
      role: 'TECHNICIEN',
      actif: true,
      tri: 'nom',
      page: 2,
      limit: 100,
    });

    expect(parametresRecus(recues[0])).toEqual({
      role: 'TECHNICIEN',
      actif: 'true',
      tri: 'nom',
      page: '2',
      limit: '100',
    });
    expect(page.data[0]?.nom).toBe('Roche');
  });

  it('US11 : envoie actif=false tel quel, omet ce qui n’est pas demandé et plafonne limit à 100', async () => {
    const recues = enregistrerLesRequetes('get', '/users', () =>
      HttpResponse.json(listePaginee([])),
    );

    await utilisateursApi.lister({ actif: false, limit: 500 });

    expect(parametresRecus(recues[0])).toEqual({ actif: 'false', limit: '100' });
  });

  it('US11 : le refus 403 d’un gestionnaire remonte en ErreurApi, avec un message générique', async () => {
    enregistrerLesRequetes('get', '/users', () =>
      HttpResponse.json(
        { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' },
        { status: 403 },
      ),
    );

    const erreur = await utilisateursApi
      .lister({ role: 'TECHNICIEN' })
      .catch((cause: unknown) => cause);

    expect(erreur).toBeInstanceOf(ErreurApi);
    expect((erreur as ErreurApi).statut).toBe(403);
    expect((erreur as ErreurApi).messagePourUtilisateur()).toBe(
      "Vous n'avez pas les droits pour effectuer cette action.",
    );
  });
});
