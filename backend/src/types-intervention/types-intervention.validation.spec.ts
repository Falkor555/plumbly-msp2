import { BadRequestException } from '@nestjs/common';
import { lireModificationType, lireNouveauType } from './types-intervention.validation.js';

function erreursDe(lecture: () => unknown): string[] {
  try {
    lecture();
  } catch (erreur) {
    if (erreur instanceof BadRequestException) {
      return (erreur.getResponse() as { message: string[] }).message;
    }
    throw erreur;
  }
  throw new Error('La lecture aurait dû être refusée.');
}

describe('validation des types d’intervention', () => {
  describe('POST /intervention-types', () => {
    it('lit un type valide et retire les espaces autour du libellé', () => {
      expect(lireNouveauType({ libelle: '  Fuite  ', dureeDefautMin: 60 })).toEqual({
        libelle: 'Fuite',
        dureeDefautMin: 60,
      });
    });

    it('exige le libellé et la durée par défaut', () => {
      expect(erreursDe(() => lireNouveauType({}))).toEqual([
        'libelle est obligatoire',
        'dureeDefautMin doit être un nombre entier de minutes entre 15 et 720',
      ]);
    });

    it.each([
      ['vide', ''],
      ['fait d’espaces', '   '],
    ])('refuse un libellé %s', (_cas, libelle) => {
      expect(erreursDe(() => lireNouveauType({ libelle, dureeDefautMin: 60 }))).toEqual([
        'libelle ne peut pas être vide',
      ]);
    });

    it('accepte 100 caractères et refuse 101', () => {
      expect(
        lireNouveauType({ libelle: 'a'.repeat(100), dureeDefautMin: 60 }).libelle,
      ).toHaveLength(100);
      expect(
        erreursDe(() => lireNouveauType({ libelle: 'a'.repeat(101), dureeDefautMin: 60 })),
      ).toEqual(['libelle ne doit pas dépasser 100 caractères']);
    });

    it.each([
      [14, false],
      [15, true],
      [720, true],
      [721, false],
      [60.5, false],
      ['60', false],
    ])('durée par défaut %s minutes acceptée : %s', (dureeDefautMin, acceptee) => {
      const lire = () => lireNouveauType({ libelle: 'Fuite', dureeDefautMin });

      if (acceptee) {
        expect(lire().dureeDefautMin).toBe(dureeDefautMin);
      } else {
        expect(lire).toThrow(BadRequestException);
      }
    });

    it('refuse un champ inconnu', () => {
      expect(
        erreursDe(() => lireNouveauType({ libelle: 'Fuite', dureeDefautMin: 60, id: 3 })),
      ).toEqual(['Le champ id n’est pas autorisé']);
    });
  });

  describe('PATCH /intervention-types/:id', () => {
    it('ne garde que les champs envoyés', () => {
      expect(lireModificationType({ dureeDefautMin: 90 })).toEqual({ dureeDefautMin: 90 });
    });

    it('refuse une modification vide', () => {
      expect(erreursDe(() => lireModificationType({}))).toEqual(['Aucun champ à modifier']);
    });

    it('refuse null sur le libellé', () => {
      expect(erreursDe(() => lireModificationType({ libelle: null }))).toEqual([
        'libelle ne peut pas être null',
      ]);
    });
  });
});
