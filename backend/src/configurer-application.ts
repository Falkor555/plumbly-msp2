import type { IncomingMessage } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';

/*
 * Réglages HTTP communs à main.ts et à l'application des tests d'intégration
 * (test/support/application-de-test.ts) : les tests appellent l'API telle qu'elle tourne.
 */

export const PREFIXE_API = 'api/v1';

/*
 * Limite du corps JSON. L'import des clients (US31) reçoit le texte d'un fichier CSV d'1 Mo au plus
 * (RG27), soit 1,5 Mo de JSON au plus une fois les guillemets et fins de ligne échappés ; toutes
 * les autres routes gardent les 100 Ko d'Express (contrat d'API, section 3). La limite métier
 * (1 000 000 caractères, 1 000 lignes) est vérifiée ensuite par la validation.
 *
 * Deux lecteurs JSON : le premier ne lit que les deux routes d'import ; le second, réglé comme celui
 * de Nest par défaut, lit tout le reste (il saute une requête déjà lue). Ils remplacent le lecteur
 * JSON par défaut de Nest ; le lecteur urlencoded par défaut, lui, reste en place.
 */
const LIMITE_DE_L_IMPORT = '1.5mb';
const LIMITE_PAR_DEFAUT = '100kb';
const ROUTES_D_IMPORT = new Set([
  `/${PREFIXE_API}/clients/import`,
  `/${PREFIXE_API}/clients/import/analysis`,
]);

export function configurerApplication(app: NestExpressApplication): void {
  app.setGlobalPrefix(PREFIXE_API);
  app.useBodyParser('json', { limit: LIMITE_DE_L_IMPORT, type: estUnImportJson });
  app.useBodyParser('json', { limit: LIMITE_PAR_DEFAUT });
}

/**
 * Corps JSON envoyé à POST /clients/import ou /clients/import/analysis. Comme le routeur
 * d'Express, la casse et une barre finale ne comptent pas, la chaîne de requête non plus.
 */
export function estUnImportJson(requete: IncomingMessage): boolean {
  const chemin = (requete.url ?? '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  const typeDeContenu = (requete.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  return (
    requete.method === 'POST' && ROUTES_D_IMPORT.has(chemin) && typeDeContenu === 'application/json'
  );
}
