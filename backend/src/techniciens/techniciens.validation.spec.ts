import { BadRequestException } from '@nestjs/common';
import {
  lireFiltresTechniciens,
  lireModificationTechnicien,
  lireNouveauTechnicien,
} from './techniciens.validation.js';

/** Messages d'une erreur 400, tels que l'API les renvoie. */
function messagesDe(action: () => unknown): unknown {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof BadRequestException) {
      return (erreur.getResponse() as { message: unknown }).message;
    }
    throw erreur;
  }
  throw new Error('Aucune erreur 400 levée');
}

describe('validation des techniciens', () => {
  describe('création', () => {
    it('lit une fiche, normalise le téléphone et met la couleur en majuscules', () => {
      expect(
        lireNouveauTechnicien({
          utilisateurId: 7,
          telephone: '06 92 12 34 56',
          couleurPlanning: '#1e88e5',
        }),
      ).toEqual({ utilisateurId: 7, telephone: '0692123456', couleurPlanning: '#1E88E5' });
    });

    it('laisse la couleur au service quand elle n’est pas fournie', () => {
      expect(lireNouveauTechnicien({ utilisateurId: 7, telephone: '0692123456' })).toEqual({
        utilisateurId: 7,
        telephone: '0692123456',
      });
    });

    it('liste toutes les erreurs dans une seule réponse', () => {
      expect(
        messagesDe(() =>
          lireNouveauTechnicien({ utilisateurId: '7', telephone: '', couleurPlanning: 'bleu' }),
        ),
      ).toEqual([
        'utilisateurId doit être un entier positif',
        'telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)',
        'couleurPlanning doit être une couleur au format #RRGGBB',
      ]);
    });

    it('refuse un champ inconnu', () => {
      expect(
        messagesDe(() =>
          lireNouveauTechnicien({ utilisateurId: 7, telephone: '0692123456', archive: false }),
        ),
      ).toEqual(['Le champ archive n’est pas autorisé']);
    });
  });

  describe('modification', () => {
    it('ne garde que les champs envoyés', () => {
      expect(lireModificationTechnicien({ couleurPlanning: '#c62828' })).toEqual({
        couleurPlanning: '#C62828',
      });
      expect(lireModificationTechnicien({})).toEqual({});
    });

    it('indique où modifier le nom et l’e-mail, qui viennent du compte', () => {
      expect(
        messagesDe(() => lireModificationTechnicien({ nom: 'Benali', email: 'k@b.re' })),
      ).toEqual([
        'nom vient du compte utilisateur : il se modifie par PATCH /users/:id',
        'email vient du compte utilisateur : il se modifie par PATCH /users/:id',
      ]);
    });

    it('refuse de changer le compte lié', () => {
      expect(messagesDe(() => lireModificationTechnicien({ utilisateurId: 8 }))).toEqual([
        'Le champ utilisateurId n’est pas autorisé',
      ]);
    });
  });

  describe('filtres de la liste', () => {
    it('applique les valeurs par défaut et lit le tri décroissant', () => {
      expect(lireFiltresTechniciens({})).toEqual({
        page: 1,
        limit: 20,
        archives: false,
        tri: 'nom',
      });
      expect(lireFiltresTechniciens({ tri: '-nom', recherche: 'kev' }).tri).toBe('-nom');
    });

    it('refuse un tri sur un autre champ', () => {
      expect(messagesDe(() => lireFiltresTechniciens({ tri: 'email' }))).toEqual([
        'tri doit valoir nom, -nom',
      ]);
    });
  });
});
