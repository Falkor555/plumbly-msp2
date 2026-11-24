import { BadRequestException } from '@nestjs/common';
import {
  lireAffectation,
  lireFiltresPlanning,
  lireNouvelleTournee,
  lireNouvelOrdre,
} from './tournees.validation.js';

const SEMAINE = { du: '2026-12-07', au: '2026-12-12' };

/** Messages d'une erreur 400, tels que l'API les renvoie. */
function messagesDe(action: () => unknown): string[] {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof BadRequestException) {
      return (erreur.getResponse() as { message: string[] }).message;
    }
    throw erreur;
  }
  throw new Error('Aucune erreur 400 levée');
}

describe('validation des données des tournées', () => {
  describe('création d’une tournée', () => {
    it('lit une tournée valide', () => {
      expect(lireNouvelleTournee({ technicienId: 3, dateTournee: '2026-12-08' })).toEqual({
        technicienId: 3,
        dateTournee: '2026-12-08',
      });
    });

    it('liste tous les champs en erreur dans une seule réponse', () => {
      const messages = messagesDe(() =>
        lireNouvelleTournee({ technicienId: '3', dateTournee: '08/12/2026' }),
      );

      expect(messages).toEqual([
        'technicienId doit être un entier positif',
        'dateTournee doit être une date AAAA-MM-JJ',
      ]);
    });

    it('refuse un champ inconnu', () => {
      const messages = messagesDe(() =>
        lireNouvelleTournee({ technicienId: 3, dateTournee: '2026-12-08', idCreateur: 1 }),
      );

      expect(messages).toEqual(['Le champ idCreateur n’est pas autorisé']);
    });

    it.each([
      ['absent', undefined],
      ['nul', null],
      ['une liste', []],
      ['un texte', 'technicienId=3'],
    ])('refuse un corps %s', (_cas, corps) => {
      expect(() => lireNouvelleTournee(corps)).toThrow(BadRequestException);
    });
  });

  describe('affectation', () => {
    it('lit une date-heure avec fuseau et un rang facultatif', () => {
      const affectation = lireAffectation({
        interventionId: 5,
        debutPrevu: '2026-12-08T08:00:00+04:00',
        ordreTournee: 2,
      });

      expect(affectation).toEqual({
        interventionId: 5,
        debutPrevu: new Date('2026-12-08T04:00:00Z'),
        ordreTournee: 2,
      });
    });

    it('n’ajoute pas de rang quand il n’est pas envoyé', () => {
      const affectation = lireAffectation({ interventionId: 5, debutPrevu: '2026-12-08T04:00Z' });

      expect(affectation).not.toHaveProperty('ordreTournee');
    });

    it.each([
      ['sans fuseau', '2026-12-08T08:00:00'],
      ['jour inexistant', '2026-02-30T08:00:00+04:00'],
      ['heure inexistante', '2026-12-08T25:00:00+04:00'],
      ['date seule', '2026-12-08'],
      ['nombre', 1796702400000],
    ])('refuse un début prévu %s', (_cas, debutPrevu) => {
      const messages = messagesDe(() => lireAffectation({ interventionId: 5, debutPrevu }));

      expect(messages).toEqual([expect.stringMatching(/^debutPrevu doit être/)]);
    });

    it.each([0, -1, 1.5, '2'])('refuse le rang %s', (ordreTournee) => {
      expect(() =>
        lireAffectation({ interventionId: 5, debutPrevu: '2026-12-08T04:00Z', ordreTournee }),
      ).toThrow(BadRequestException);
    });
  });

  describe('nouvel ordre', () => {
    it('lit la liste des identifiants', () => {
      expect(lireNouvelOrdre({ interventionIds: [3, 1, 2] })).toEqual({
        interventionIds: [3, 1, 2],
      });
    });

    it('refuse deux fois la même intervention (TI14)', () => {
      expect(messagesDe(() => lireNouvelOrdre({ interventionIds: [3, 1, 3] }))).toEqual([
        'interventionIds contient deux fois la même intervention',
      ]);
    });

    it.each([
      ['vide', []],
      ['absente', undefined],
      ['avec un texte', [1, '2']],
      ['trop longue', Array.from({ length: 101 }, (_valeur, index) => index + 1)],
    ])('refuse une liste %s', (_cas, interventionIds) => {
      expect(() => lireNouvelOrdre({ interventionIds })).toThrow(BadRequestException);
    });
  });

  describe('filtres du planning', () => {
    it('renvoie la semaine par défaut sans période', () => {
      expect(lireFiltresPlanning({}, SEMAINE)).toEqual(SEMAINE);
    });

    it('lit une journée et un technicien', () => {
      expect(
        lireFiltresPlanning({ du: '2026-12-08', au: '2026-12-08', technicienId: '2' }, SEMAINE),
      ).toEqual({ du: '2026-12-08', au: '2026-12-08', technicienId: 2 });
    });

    it.each([
      ['une seule borne', { du: '2026-12-08' }],
      ['des bornes inversées', { du: '2026-12-09', au: '2026-12-08' }],
      ['plus de 31 jours', { du: '2026-12-01', au: '2027-01-01' }],
      ['une borne répétée', { du: ['2026-12-08', '2026-12-09'], au: '2026-12-09' }],
      ['un technicien invalide', { technicienId: '2 OR 1=1' }],
      ['un paramètre inconnu', { semaine: '50' }],
    ])('refuse %s', (_cas, requete) => {
      expect(() => lireFiltresPlanning(requete, SEMAINE)).toThrow(BadRequestException);
    });
  });
});
