import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const PORT_PAR_DEFAUT = 3000;

// Lancement hors Docker (npm run start:dev) : DATABASE_URL vient de backend/.env.
// Dans Docker, docker-compose.yml fournit les variables et elles ne sont pas écrasées par ce fichier.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  // 0.0.0.0 : dans un conteneur, écouter sur localhost rendrait l'API injoignable depuis l'hôte.
  await app.listen(Number(process.env.PORT ?? PORT_PAR_DEFAUT), '0.0.0.0');
}
await bootstrap();
