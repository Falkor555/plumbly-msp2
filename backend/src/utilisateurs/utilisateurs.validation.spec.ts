import { BadRequestException } from '@nestjs/common';
import {
  lireChangementMotDePasse,
  lireFiltresUtilisateurs,
  lireModificationProfil,
  lireModificationUtilisateur,
  lireNouvelUtilisateur,
} from './utilisateurs.validation.js';

describe('lecture de PATCH /users/me', () => {
  it('lit le nom et le prénom, sans les espaces autour', () => {
    expect(lireModificationProfil({ nom: ' Martin ', prenom: 'Sophie' })).toEqual({
      nom: 'Martin',
      prenom: 'Sophie',
    });
  });

  it('refuse un corps sans champ à modifier', () => {
    expect(() => lireModificationProfil({})).toThrow(BadRequestException);
  });

  it('refuse de modifier son rôle ou son e-mail', () => {
    expect(() => lireModificationProfil({ role: 'ADMIN', email: 'moi@exemple.fr' })).toThrow(
      new BadRequestException([
        'Le champ role n’est pas autorisé',
        'Le champ email n’est pas autorisé',
      ]),
    );
  });
});

describe('lecture de PATCH /users/me/password', () => {
  it('accepte un nouveau mot de passe conforme', () => {
    expect(
      lireChangementMotDePasse({
        ancienMotDePasse: 'ancien',
        nouveauMotDePasse: 'Nouveau#MotDePasse2',
      }),
    ).toEqual({ ancienMotDePasse: 'ancien', nouveauMotDePasse: 'Nouveau#MotDePasse2' });
  });

  it('liste les règles de la politique non respectées', () => {
    expect(() =>
      lireChangementMotDePasse({ ancienMotDePasse: 'ancien', nouveauMotDePasse: 'court' }),
    ).toThrow(
      new BadRequestException([
        'nouveauMotDePasse doit contenir au moins 12 caractères',
        'nouveauMotDePasse doit contenir au moins une majuscule',
        'nouveauMotDePasse doit contenir au moins un chiffre',
        'nouveauMotDePasse doit contenir au moins un caractère spécial',
      ]),
    );
  });

  it('refuse un nouveau mot de passe identique à l’ancien', () => {
    expect(() =>
      lireChangementMotDePasse({
        ancienMotDePasse: 'Meme#MotDePasse1',
        nouveauMotDePasse: 'Meme#MotDePasse1',
      }),
    ).toThrow(new BadRequestException(['nouveauMotDePasse doit être différent de l’ancien']));
  });
});

describe('lecture de GET /users', () => {
  it('applique les valeurs par défaut', () => {
    expect(lireFiltresUtilisateurs({})).toEqual({ page: 1, limit: 20, tri: 'nom' });
  });

  it('lit les filtres de rôle et d’état du compte', () => {
    expect(lireFiltresUtilisateurs({ role: 'TECHNICIEN', actif: 'false' })).toMatchObject({
      role: 'TECHNICIEN',
      actif: false,
    });
  });

  it('refuse un filtre actif invalide', () => {
    expect(() => lireFiltresUtilisateurs({ actif: 'oui' })).toThrow(
      new BadRequestException(['actif doit valoir true ou false']),
    );
  });
});

describe('lecture de POST /users', () => {
  it('met l’e-mail en minuscules', () => {
    expect(
      lireNouvelUtilisateur({
        email: 'Julie.Roche@Plumbly.test',
        nom: 'Roche',
        prenom: 'Julie',
        role: 'TECHNICIEN',
      }),
    ).toEqual({
      email: 'julie.roche@plumbly.test',
      nom: 'Roche',
      prenom: 'Julie',
      role: 'TECHNICIEN',
    });
  });

  it('signale tous les champs manquants en une fois', () => {
    expect(() => lireNouvelUtilisateur({})).toThrow(
      new BadRequestException([
        'email est obligatoire',
        'nom est obligatoire',
        'prenom est obligatoire',
        'role doit valoir ADMIN ou GESTIONNAIRE ou TECHNICIEN',
      ]),
    );
  });
});

describe('lecture de PATCH /users/:id', () => {
  it('refuse un corps sans champ à modifier', () => {
    expect(() => lireModificationUtilisateur({})).toThrow(BadRequestException);
  });
});
