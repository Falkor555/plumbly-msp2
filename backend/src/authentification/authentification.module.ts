import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { Horloge } from '../commun/horloge.js';
import { AuthentificationController } from './authentification.controller.js';
import { AuthentificationGuard } from './authentification.guard.js';
import { AuthentificationRepository } from './authentification.repository.js';
import { AuthentificationService } from './authentification.service.js';
import { DUREE_JETON_ACCES_SECONDES, lireSecretJwt } from './jetons.js';

const QUINZE_MINUTES_MS = 15 * 60 * 1000;

@Module({
  imports: [
    // registerAsync : le secret est lu au démarrage, après le chargement de .env par main.ts.
    // Lu à l'import du fichier, il serait encore vide hors Docker.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: lireSecretJwt(),
        signOptions: { algorithm: 'HS256', expiresIn: DUREE_JETON_ACCES_SECONDES },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Appliqué uniquement aux routes marquées @UseGuards(ThrottlerGuard) : la connexion.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: QUINZE_MINUTES_MS, limit: 5 }],
      errorMessage: 'Trop de tentatives de connexion : réessayer dans 15 minutes.',
    }),
  ],
  controllers: [AuthentificationController],
  providers: [
    AuthentificationRepository,
    AuthentificationService,
    Horloge,
    AuthentificationGuard,
    // useExisting plutôt que useClass : les tests peuvent remplacer AuthentificationGuard.
    { provide: APP_GUARD, useExisting: AuthentificationGuard },
  ],
})
export class AuthentificationModule {}
