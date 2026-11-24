import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  creneauDe,
  nouveauxRangs,
  rangDInsertion,
  semaineDe,
  seChevauchent,
  verifierAbsenceDeChevauchement,
  verifierAffectable,
  verifierDateDeTournee,
  verifierDisponibilite,
  verifierHorairesOuvres,
  verifierRetirable,
  type RangDansLaTournee,
} from './regles-planification.js';

/** Heure de La Réunion (UTC+4) le 8 décembre 2026, un mardi. */
function mardi(heure: string): Date {
  return new Date(`2026-12-08T${heure}:00+04:00`);
}

// Lundi 7 décembre 2026, 9 h à La Réunion.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');

describe('règles de planification', () => {
  describe('RG09 : chevauchement de deux créneaux', () => {
    const existant = { debut: mardi('09:00'), fin: mardi('10:00') };

    it.each([
      ['commence pendant', '09:30', '10:30', true],
      ['finit pendant', '08:30', '09:30', true],
      ['englobe', '08:00', '11:00', true],
      ['identique', '09:00', '10:00', true],
      ['commence à la fin de l’autre', '10:00', '11:00', false],
      ['finit au début de l’autre', '08:00', '09:00', false],
    ])('un créneau qui %s → %s', (_cas, debut, fin, attendu) => {
      const nouveau = { debut: mardi(debut), fin: mardi(fin) };

      expect(seChevauchent(existant, nouveau)).toBe(attendu);
    });

    it('refuse en 409 avec le numéro et l’horaire de l’intervention en conflit', () => {
      const creneau = creneauDe(mardi('09:30'), 60);

      expect(() => verifierAbsenceDeChevauchement(creneau, [{ id: 12, ...existant }])).toThrow(
        new ConflictException(
          'Le technicien a déjà l’intervention n° 12 sur ce créneau (09:00–10:00).',
        ),
      );
    });

    it('accepte un créneau collé au précédent', () => {
      const creneau = creneauDe(mardi('10:00'), 30);

      expect(() =>
        verifierAbsenceDeChevauchement(creneau, [{ id: 12, ...existant }]),
      ).not.toThrow();
    });
  });

  describe('RG10 : indisponibilité', () => {
    it('refuse en 409 un créneau pendant une indisponibilité, motif compris', () => {
      const conges = { debut: mardi('07:00'), fin: mardi('12:00'), motif: 'Congés' };

      expect(() => verifierDisponibilite(creneauDe(mardi('11:30'), 60), [conges])).toThrow(
        /indisponible du 2026-12-08 07:00 au 2026-12-08 12:00 \(Congés\)/,
      );
    });

    it('accepte un créneau qui commence à la fin de l’indisponibilité', () => {
      const conges = { debut: mardi('07:00'), fin: mardi('12:00'), motif: null };

      expect(() => verifierDisponibilite(creneauDe(mardi('12:00'), 60), [conges])).not.toThrow();
    });
  });

  describe('RG11 : horaires ouvrés à La Réunion', () => {
    it.each([
      ['de 7 h à 8 h', '07:00', 60],
      ['de 18 h à 19 h', '18:00', 60],
    ])('accepte un créneau %s', (_cas, debut, duree) => {
      expect(() =>
        verifierHorairesOuvres(creneauDe(mardi(debut), duree), '2026-12-08'),
      ).not.toThrow();
    });

    it.each([
      ['avant 7 h', '06:30', 60],
      ['après 19 h', '18:30', 60],
    ])('refuse en 400 un créneau qui déborde %s', (_cas, debut, duree) => {
      expect(() => verifierHorairesOuvres(creneauDe(mardi(debut), duree), '2026-12-08')).toThrow(
        BadRequestException,
      );
    });

    it('refuse un créneau placé un autre jour que celui de la tournée', () => {
      const creneau = creneauDe(mardi('09:00'), 60);

      expect(() => verifierHorairesOuvres(creneau, '2026-12-09')).toThrow(BadRequestException);
    });

    it('lit l’heure à La Réunion et non en UTC', () => {
      // 04:00 UTC = 08:00 à La Réunion : valable, alors qu'en UTC ce serait avant 7 h.
      const creneau = creneauDe(new Date('2026-12-08T04:00:00Z'), 60);

      expect(() => verifierHorairesOuvres(creneau, '2026-12-08')).not.toThrow();
    });
  });

  describe('RG11 et RG12 : date de la tournée', () => {
    it('accepte aujourd’hui et un jour à venir', () => {
      expect(() => verifierDateDeTournee('2026-12-07', MAINTENANT)).not.toThrow();
      expect(() => verifierDateDeTournee('2026-12-12', MAINTENANT)).not.toThrow();
    });

    it('refuse une date passée', () => {
      expect(() => verifierDateDeTournee('2026-12-06', MAINTENANT)).toThrow(/date passée/);
    });

    it('refuse un dimanche', () => {
      expect(() => verifierDateDeTournee('2026-12-13', MAINTENANT)).toThrow(/lundi au samedi/);
    });

    it('prend « aujourd’hui » à La Réunion : à 22 h UTC, on y est déjà le lendemain', () => {
      const dimancheSoirUtc = new Date('2026-12-06T22:00:00Z');

      expect(() => verifierDateDeTournee('2026-12-06', dimancheSoirUtc)).toThrow(/date passée/);
    });
  });

  describe('semaine du planning', () => {
    it.each([
      ['un lundi', '2026-12-07'],
      ['un mercredi', '2026-12-09'],
      ['un samedi', '2026-12-12'],
      ['un dimanche', '2026-12-13'],
    ])('va du lundi au samedi pour %s', (_cas, jour) => {
      expect(semaineDe(jour)).toEqual({ du: '2026-12-07', au: '2026-12-12' });
    });
  });

  describe('RG02 et RG04 : statuts', () => {
    it('n’affecte qu’une intervention à planifier', () => {
      expect(() => verifierAffectable('A_PLANIFIER')).not.toThrow();
      expect(() => verifierAffectable('PLANIFIEE')).toThrow(BadRequestException);
      expect(() => verifierAffectable('ANNULEE')).toThrow(BadRequestException);
    });

    it('ne retire qu’une intervention planifiée non démarrée', () => {
      expect(() => verifierRetirable('PLANIFIEE')).not.toThrow();
      expect(() => verifierRetirable('EN_COURS')).toThrow(BadRequestException);
      expect(() => verifierRetirable('TERMINEE')).toThrow(BadRequestException);
    });
  });

  describe('RG13 : rang d’insertion', () => {
    const tournee: RangDansLaTournee[] = [
      { id: 1, statut: 'TERMINEE', ordreTournee: 1 },
      { id: 2, statut: 'PLANIFIEE', ordreTournee: 2 },
    ];

    it('place la nouvelle intervention en dernier par défaut', () => {
      expect(rangDInsertion(tournee, undefined)).toBe(3);
    });

    it('place la première intervention d’une tournée vide au rang 1', () => {
      expect(rangDInsertion([], undefined)).toBe(1);
    });

    it('accepte un rang devant une intervention seulement planifiée', () => {
      expect(rangDInsertion(tournee, 2)).toBe(2);
    });

    it('refuse un rang au-delà du dernier + 1', () => {
      expect(() => rangDInsertion(tournee, 4)).toThrow(/entre 1 et 3/);
    });

    it('refuse d’insérer devant une intervention terminée (RG16)', () => {
      expect(() => rangDInsertion(tournee, 1)).toThrow(/n° 1 \(TERMINEE\)/);
    });
  });

  describe('RG14 à RG16 : réordonnancement', () => {
    const tournee: RangDansLaTournee[] = [
      { id: 10, statut: 'EN_COURS', ordreTournee: 1 },
      { id: 11, statut: 'PLANIFIEE', ordreTournee: 2 },
      { id: 12, statut: 'PLANIFIEE', ordreTournee: 3 },
    ];

    it('renvoie les nouveaux rangs, à partir de 1', () => {
      const rangs = nouveauxRangs(tournee, [10, 12, 11]);

      expect([...rangs]).toEqual([
        [10, 1],
        [12, 2],
        [11, 3],
      ]);
    });

    it('refuse une liste à laquelle il manque une intervention', () => {
      expect(() => nouveauxRangs(tournee, [10, 12])).toThrow(/exactement les interventions/);
    });

    it('refuse une intervention qui n’est pas dans la tournée', () => {
      expect(() => nouveauxRangs(tournee, [10, 12, 99])).toThrow(/exactement les interventions/);
    });

    it('refuse de déplacer une intervention en cours (RG15)', () => {
      expect(() => nouveauxRangs(tournee, [11, 10, 12])).toThrow(/n° 10 \(EN_COURS\)/);
    });
  });
});
