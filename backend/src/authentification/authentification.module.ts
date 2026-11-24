import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthentificationGuard } from './authentification.guard.js';
import { DUREE_JETON_ACCES_SECONDES, lireSecretJwt } from './jetons.js';

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
  ],
  providers: [
    AuthentificationGuard,
    // useExisting plutôt que useClass : les tests peuvent remplacer AuthentificationGuard.
    { provide: APP_GUARD, useExisting: AuthentificationGuard },
  ],
})
export class AuthentificationModule {}
