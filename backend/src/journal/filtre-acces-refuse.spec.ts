import { type ArgumentsHost, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { FILTER_CATCH_EXCEPTIONS } from '@nestjs/common/constants.js';
import type { HttpAdapterHost } from '@nestjs/core';
import type { UtilisateurConnecte } from '../commun/autorisation/utilisateur-connecte.js';
import { FiltreAccesRefuse, ROUTE_INCONNUE } from './filtre-acces-refuse.js';
import type { JournalDesActions } from './journal-des-actions.js';

const GESTIONNAIRE: UtilisateurConnecte = { id: 2, role: 'GESTIONNAIRE' };
const MODELE = '/api/v1/interventions';

interface RequeteSimulee {
  method: string;
  originalUrl: string;
  route?: { path: string };
  user?: UtilisateurConnecte;
}

function preparer(requete: RequeteSimulee) {
  const journal = { enregistrer: vi.fn().mockResolvedValue(undefined) };
  const httpAdapter = {
    reply: vi.fn(),
    isHeadersSent: vi.fn().mockReturnValue(false),
    end: vi.fn(),
  };
  const reponse = { simulee: true };
  const hote = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => requete, getResponse: () => reponse }),
    getArgByIndex: (rang: number) => [requete, reponse][rang],
  } as unknown as ArgumentsHost;
  const filtre = new FiltreAccesRefuse(
    journal as unknown as JournalDesActions,
    { httpAdapter } as unknown as HttpAdapterHost,
  );
  return { filtre, journal, httpAdapter, reponse, hote };
}

describe('FiltreAccesRefuse', () => {
  it('journalise ACCES_REFUSE avec l’auteur, la méthode et le modèle de route, puis répond le même 403', () => {
    const { filtre, journal, httpAdapter, reponse, hote } = preparer({
      method: 'POST',
      originalUrl: '/api/v1/interventions',
      route: { path: MODELE },
      user: GESTIONNAIRE,
    });

    filtre.catch(new ForbiddenException('Accès refusé.'), hote);

    expect(journal.enregistrer).toHaveBeenCalledExactlyOnceWith({
      type: 'ACCES_REFUSE',
      auteur: { id: 2, role: 'GESTIONNAIRE' },
      methode: 'POST',
      route: MODELE,
    });
    expect(httpAdapter.reply).toHaveBeenCalledExactlyOnceWith(
      reponse,
      { statusCode: 403, message: 'Accès refusé.', error: 'Forbidden' },
      403,
    );
    expect(journal.enregistrer.mock.invocationCallOrder[0]).toBeLessThan(
      httpAdapter.reply.mock.invocationCallOrder[0],
    );
  });

  it('garde le message d’un 403 levé par un service', () => {
    const { filtre, httpAdapter, reponse, hote } = preparer({
      method: 'GET',
      originalUrl: '/api/v1/interventions/42',
      route: { path: '/api/v1/interventions/:id' },
      user: { id: 7, role: 'TECHNICIEN' },
    });

    filtre.catch(
      new ForbiddenException('Cette intervention ne fait pas partie de vos tournées.'),
      hote,
    );

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      reponse,
      {
        statusCode: 403,
        message: 'Cette intervention ne fait pas partie de vos tournées.',
        error: 'Forbidden',
      },
      403,
    );
  });

  it('n’écrit jamais l’URL reçue ni sa chaîne de requête, seulement le modèle de route', () => {
    const { filtre, journal, hote } = preparer({
      method: 'GET',
      originalUrl: '/api/v1/interventions?recherche=H%C3%A9l%C3%A8ne',
      route: { path: MODELE },
      user: { id: 7, role: 'TECHNICIEN' },
    });

    filtre.catch(new ForbiddenException('Accès refusé.'), hote);

    const ecrit = JSON.stringify(journal.enregistrer.mock.calls);
    expect(ecrit).not.toContain('recherche');
    expect(ecrit).not.toContain('H%C3%A9l%C3%A8ne');
    expect(journal.enregistrer).toHaveBeenCalledWith(expect.objectContaining({ route: MODELE }));
  });

  it('écrit un repli fixe quand le 403 est levé hors d’une route', () => {
    const { filtre, journal, hote } = preparer({
      method: 'GET',
      originalUrl: '/api/v1/clients?recherche=Grondin',
      user: GESTIONNAIRE,
    });

    filtre.catch(new ForbiddenException('Accès refusé.'), hote);

    expect(journal.enregistrer).toHaveBeenCalledWith(
      expect.objectContaining({ route: ROUTE_INCONNUE }),
    );
  });

  it('ne journalise rien sans utilisateur, mais répond quand même 403', () => {
    const { filtre, journal, httpAdapter, hote } = preparer({
      method: 'GET',
      originalUrl: '/api/v1/clients',
      route: { path: '/api/v1/clients' },
    });

    filtre.catch(new ForbiddenException('Accès refusé.'), hote);

    expect(journal.enregistrer).not.toHaveBeenCalled();
    expect(httpAdapter.reply).toHaveBeenCalledWith(expect.anything(), expect.anything(), 403);
  });

  it('ne capte que les 403 : un 401 n’est pas déclaré dans @Catch', () => {
    const exceptionsCaptees = Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, FiltreAccesRefuse);

    expect(exceptionsCaptees).toEqual([ForbiddenException]);
    expect(exceptionsCaptees).not.toContain(UnauthorizedException);
  });
});
