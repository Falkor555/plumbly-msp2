import { BadRequestException } from '@nestjs/common';
import { lireFiltresInterventions, lireNouvelleIntervention } from './interventions.validation.js';

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

const NOUVELLE = {
  adresseId: 15,
  typeInterventionId: 1,
  description: 'Fuite sous l’évier',
  urgence: 'PRIORITAIRE',
};

describe('validation des interventions', () => {
  describe('POST /interventions', () => {
    it('lit une intervention valide sans durée (celle du type sera reprise)', () => {
      expect(lireNouvelleIntervention({ ...NOUVELLE, description: '  Fuite  ' })).toEqual({
        ...NOUVELLE,
        description: 'Fuite',
      });
    });

    it('garde la durée envoyée', () => {
      expect(lireNouvelleIntervention({ ...NOUVELLE, dureeEstimeeMin: 90 }).dureeEstimeeMin).toBe(
        90,
      );
    });

    it('liste toutes les erreurs d’un corps vide', () => {
      expect(erreursDe(() => lireNouvelleIntervention({}))).toEqual([
        'adresseId doit être un entier positif',
        'typeInterventionId doit être un entier positif',
        'description est obligatoire',
        'urgence doit être NORMALE, PRIORITAIRE ou URGENTE',
      ]);
    });

    it.each([
      ['vide', ''],
      ['faite d’espaces', '   '],
    ])('refuse une description %s', (_cas, description) => {
      expect(erreursDe(() => lireNouvelleIntervention({ ...NOUVELLE, description }))).toEqual([
        'description ne peut pas être vide',
      ]);
    });

    it('accepte 1 000 caractères et refuse 1 001', () => {
      expect(
        lireNouvelleIntervention({ ...NOUVELLE, description: 'a'.repeat(1000) }).description,
      ).toHaveLength(1000);
      expect(
        erreursDe(() => lireNouvelleIntervention({ ...NOUVELLE, description: 'a'.repeat(1001) })),
      ).toEqual(['description ne doit pas dépasser 1000 caractères']);
    });

    it.each([
      [14, false],
      [15, true],
      [720, true],
      [721, false],
      [0, false],
      [30.5, false],
    ])('durée de %s minutes acceptée : %s', (dureeEstimeeMin, acceptee) => {
      const lire = () => lireNouvelleIntervention({ ...NOUVELLE, dureeEstimeeMin });

      if (acceptee) {
        expect(lire().dureeEstimeeMin).toBe(dureeEstimeeMin);
      } else {
        expect(erreursDe(lire)).toEqual([
          'dureeEstimeeMin doit être un nombre entier de minutes entre 15 et 720',
        ]);
      }
    });

    it('refuse une urgence inconnue avec le message du contrat', () => {
      expect(
        erreursDe(() => lireNouvelleIntervention({ ...NOUVELLE, urgence: 'urgente' })),
      ).toEqual(['urgence doit être NORMALE, PRIORITAIRE ou URGENTE']);
    });

    it.each(['statut', 'clientId', 'idTournee', 'ordreTournee'])(
      'refuse le champ %s, qui ne s’envoie pas à la création',
      (champ) => {
        expect(erreursDe(() => lireNouvelleIntervention({ ...NOUVELLE, [champ]: 1 }))).toEqual([
          `Le champ ${champ} n’est pas autorisé`,
        ]);
      },
    );
  });

  describe('GET /interventions', () => {
    it('trie par défaut par urgence décroissante, 20 par page', () => {
      expect(lireFiltresInterventions({})).toEqual({ page: 1, limit: 20, tri: '-urgence' });
    });

    it('lit tous les filtres ensemble', () => {
      expect(
        lireFiltresInterventions({
          page: '2',
          limit: '100',
          recherche: ' helene ',
          statut: 'A_PLANIFIER,PLANIFIEE,A_PLANIFIER',
          urgence: 'URGENTE',
          technicienId: '2',
          clientId: '8',
          du: '2026-12-07',
          au: '2026-12-12',
          tri: '-creeLe',
        }),
      ).toEqual({
        page: 2,
        limit: 100,
        recherche: 'helene',
        statuts: ['A_PLANIFIER', 'PLANIFIEE'],
        urgence: 'URGENTE',
        technicienId: 2,
        clientId: 8,
        du: '2026-12-07',
        au: '2026-12-12',
        tri: '-creeLe',
      });
    });

    it('nomme le statut refusé dans une liste', () => {
      expect(erreursDe(() => lireFiltresInterventions({ statut: 'A_PLANIFIER,FOO' }))).toEqual([
        'statut doit contenir un ou plusieurs statuts séparés par des virgules parmi A_PLANIFIER, PLANIFIEE, EN_COURS, TERMINEE, ANNULEE (refusé : FOO)',
      ]);
    });

    it.each([
      ['un statut vide', { statut: '' }],
      ['une virgule finale', { statut: 'A_PLANIFIER,' }],
      ['un statut répété en paramètre', { statut: ['A_PLANIFIER', 'PLANIFIEE'] }],
      ['un tri inconnu', { tri: 'urgence' }],
      ['un technicien non numérique', { technicienId: '1e3' }],
      ['un client à zéro', { clientId: '0' }],
      ['une date impossible', { du: '2026-02-30' }],
      ['du après au', { du: '2026-12-12', au: '2026-12-07' }],
      ['une limite de 101', { limit: '101' }],
      ['une recherche d’un caractère', { recherche: 'a' }],
      ['un paramètre inconnu', { archives: 'true' }],
      ['du SQL dans un filtre', { urgence: "' OR 1=1 --" }],
    ])('refuse %s', (_cas, requete) => {
      expect(() => lireFiltresInterventions(requete)).toThrow(BadRequestException);
    });

    it('accepte du seul ou au seul', () => {
      expect(lireFiltresInterventions({ du: '2026-12-07' }).du).toBe('2026-12-07');
      expect(lireFiltresInterventions({ au: '2026-12-07' }).au).toBe('2026-12-07');
    });
  });
});
