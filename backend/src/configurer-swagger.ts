import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Adresse de la documentation : http://localhost:3000/api/docs (contrat d'API, card #32). */
export const CHEMIN_DOCUMENTATION = 'api/docs';

/**
 * Documentation interactive de l'API, générée à partir des contrôleurs NestJS.
 * Le bouton « Authorize » permet d'appeler les routes protégées avec un jeton d'accès.
 */
export function configurerSwagger(app: INestApplication): void {
  const configuration = new DocumentBuilder()
    .setTitle('API Plumbly')
    .setDescription(
      'API REST de Plumbly, progiciel de gestion des tournées de plombiers. ' +
        'Le contrat détaillé (règles de gestion, erreurs, exemples) est dans docs/api.md.',
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: "Jeton d'accès obtenu par POST /api/v1/auth/login, valable 15 minutes.",
    })
    .build();

  const document = SwaggerModule.createDocument(app, configuration);
  SwaggerModule.setup(CHEMIN_DOCUMENTATION, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
