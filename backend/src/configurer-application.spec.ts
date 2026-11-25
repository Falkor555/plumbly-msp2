import type { IncomingMessage } from 'node:http';
import { estUnImportJson } from './configurer-application.js';

function requete(methode: string, url: string, typeDeContenu?: string): IncomingMessage {
  const headers = typeDeContenu === undefined ? {} : { 'content-type': typeDeContenu };
  return { method: methode, url, headers } as IncomingMessage;
}

describe('estUnImportJson', () => {
  it.each([
    ['/api/v1/clients/import', 'application/json'],
    ['/api/v1/clients/import/analysis', 'application/json'],
    ['/api/v1/clients/import', 'application/json; charset=utf-8'],
    ['/api/v1/clients/import?x=1', 'application/json'],
    ['/api/v1/clients/import/', 'application/json'],
    ['/API/V1/Clients/Import/Analysis', 'Application/JSON'],
  ])('lit en 1,5 Mo POST %s (%s)', (url, typeDeContenu) => {
    expect(estUnImportJson(requete('POST', url, typeDeContenu))).toBe(true);
  });

  it.each([
    ['une autre route', 'POST', '/api/v1/clients', 'application/json'],
    ['une route voisine', 'POST', '/api/v1/clients/import/analysis/autre', 'application/json'],
    ['la signature', 'POST', '/api/v1/interventions/1/complete', 'application/json'],
    ['un autre verbe', 'PUT', '/api/v1/clients/import', 'application/json'],
    ['un autre type de contenu', 'POST', '/api/v1/clients/import', 'text/plain'],
    ['un formulaire', 'POST', '/api/v1/clients/import', 'application/x-www-form-urlencoded'],
    ['un corps sans type', 'POST', '/api/v1/clients/import', undefined],
    ['une route sans préfixe', 'POST', '/clients/import', 'application/json'],
  ])('laisse %s aux 100 Ko par défaut', (_cas, methode, url, typeDeContenu) => {
    expect(estUnImportJson(requete(methode, url, typeDeContenu))).toBe(false);
  });
});
