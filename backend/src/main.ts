import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const PORT_PAR_DEFAUT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  // 0.0.0.0 : dans un conteneur, écouter sur localhost rendrait l'API injoignable depuis l'hôte.
  await app.listen(Number(process.env.PORT ?? PORT_PAR_DEFAUT), '0.0.0.0');
}
await bootstrap();
