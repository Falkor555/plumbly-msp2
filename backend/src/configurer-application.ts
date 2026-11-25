import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Préfixe de toutes les routes (contrat d'API, section 1). */
export const PREFIXE_API = 'api/v1';

/**
 * Réglages HTTP de l'application, communs à main.ts et aux tests d'intégration :
 * les tests vérifient ainsi l'application telle qu'elle tourne vraiment.
 */
export function configurerApplication(app: INestApplication): void {
  // En-têtes de sécurité recommandés par l'OWASP : retire « X-Powered-By: Express »,
  // interdit l'affichage dans une page tierce (clickjacking), empêche le navigateur de deviner
  // le type d'une réponse, et limite les scripts exécutables au site lui-même (CSP, contre XSS).
  app.use(helmet());
  // Lecture des cookies : le jeton de rafraîchissement arrive dans le cookie refresh_token.
  app.use(cookieParser());
  app.setGlobalPrefix(PREFIXE_API);
}
