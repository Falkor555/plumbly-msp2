import { BadRequestException } from '@nestjs/common';
import type { StatutIntervention } from '../generated/prisma/client.ts';
import { verifierAffectable, verifierRetirable } from '../tournees/regles-planification.js';
import {
  type ActionSurIntervention,
  statutApres,
  TRANSITIONS,
  verifierCompteRenduModifiable,
  verifierModifiable,
} from './cycle-de-vie.js';

const STATUTS: StatutIntervention[] = [
  'A_PLANIFIER',
  'PLANIFIEE',
  'EN_COURS',
  'TERMINEE',
  'ANNULEE',
];

describe('cycle de vie d’une intervention (cahier des charges, 5.1)', () => {
  describe('toutes les paires (statut de départ, action)', () => {
    it.each<[StatutIntervention, ActionSurIntervention, StatutIntervention | 'refusée']>([
      ['A_PLANIFIER', 'affecter', 'PLANIFIEE'],
      ['A_PLANIFIER', 'retirer', 'refusée'],
      ['A_PLANIFIER', 'demarrer', 'refusée'],
      ['A_PLANIFIER', 'terminer', 'refusée'],
      ['A_PLANIFIER', 'annuler', 'ANNULEE'],
      ['PLANIFIEE', 'affecter', 'refusée'],
      ['PLANIFIEE', 'retirer', 'A_PLANIFIER'],
      ['PLANIFIEE', 'demarrer', 'EN_COURS'],
      ['PLANIFIEE', 'terminer', 'refusée'],
      ['PLANIFIEE', 'annuler', 'ANNULEE'],
      ['EN_COURS', 'affecter', 'refusée'],
      ['EN_COURS', 'retirer', 'refusée'],
      ['EN_COURS', 'demarrer', 'refusée'],
      ['EN_COURS', 'terminer', 'TERMINEE'],
      ['EN_COURS', 'annuler', 'ANNULEE'],
      ['TERMINEE', 'affecter', 'refusée'],
      ['TERMINEE', 'retirer', 'refusée'],
      ['TERMINEE', 'demarrer', 'refusée'],
      ['TERMINEE', 'terminer', 'refusée'],
      ['TERMINEE', 'annuler', 'refusée'],
      ['ANNULEE', 'affecter', 'refusée'],
      ['ANNULEE', 'retirer', 'refusée'],
      ['ANNULEE', 'demarrer', 'refusée'],
      ['ANNULEE', 'terminer', 'refusée'],
      ['ANNULEE', 'annuler', 'refusée'],
    ])('%s puis %s → %s', (depart, action, attendu) => {
      const appliquer = () => statutApres(depart, action);

      if (attendu === 'refusée') {
        expect(appliquer).toThrow(BadRequestException);
      } else {
        expect(appliquer()).toBe(attendu);
      }
    });
  });

  it('suit le diagramme d’états : Terminée et Annulée sont définitives', () => {
    const graphe = Object.fromEntries(
      STATUTS.map((depart) => [
        depart,
        Object.values(TRANSITIONS)
          .filter(({ depuis }) => depuis.includes(depart))
          .map(({ vers }) => vers)
          .sort(),
      ]),
    );

    expect(graphe).toEqual({
      A_PLANIFIER: ['ANNULEE', 'PLANIFIEE'],
      PLANIFIEE: ['ANNULEE', 'A_PLANIFIER', 'EN_COURS'],
      EN_COURS: ['ANNULEE', 'TERMINEE'],
      TERMINEE: [],
      ANNULEE: [],
    });
  });

  it.each<[StatutIntervention, ActionSurIntervention, string]>([
    ['TERMINEE', 'demarrer', 'Impossible de démarrer une intervention terminée.'],
    ['PLANIFIEE', 'affecter', 'Impossible d’affecter une intervention planifiée.'],
    ['EN_COURS', 'retirer', 'Impossible de retirer une intervention en cours.'],
    ['ANNULEE', 'annuler', 'Impossible d’annuler une intervention annulée.'],
    ['A_PLANIFIER', 'terminer', 'Impossible de terminer une intervention à planifier.'],
  ])('refuse %s puis %s avec un message lisible par un gestionnaire', (depart, action, message) => {
    expect(() => statutApres(depart, action)).toThrow(message);
  });

  describe('cohérence avec les règles des tournées', () => {
    it.each(STATUTS)(
      'verifierAffectable et verifierRetirable suivent la table pour %s',
      (statut) => {
        const suitLaTable = (
          verifier: (statut: StatutIntervention) => void,
          action: ActionSurIntervention,
        ) => {
          const autorise = TRANSITIONS[action].depuis.includes(statut);
          if (autorise) {
            expect(() => verifier(statut)).not.toThrow();
          } else {
            expect(() => verifier(statut)).toThrow(BadRequestException);
          }
        };

        suitLaTable(verifierAffectable, 'affecter');
        suitLaTable(verifierRetirable, 'retirer');
      },
    );
  });

  describe('RG06 et RG15 : modification', () => {
    it.each<[StatutIntervention, boolean]>([
      ['A_PLANIFIER', true],
      ['PLANIFIEE', true],
      ['EN_COURS', false],
      ['TERMINEE', false],
      ['ANNULEE', false],
    ])('intervention %s modifiable (hors adresse) : %s', (statut, modifiable) => {
      const modifier = () => verifierModifiable(statut, { changeAdresse: false });

      if (modifiable) {
        expect(modifier).not.toThrow();
      } else {
        expect(modifier).toThrow(BadRequestException);
      }
    });

    it('accepte un changement d’adresse tant que l’intervention est à planifier', () => {
      expect(() => verifierModifiable('A_PLANIFIER', { changeAdresse: true })).not.toThrow();
    });

    it('refuse un changement d’adresse sur une intervention planifiée', () => {
      expect(() => verifierModifiable('PLANIFIEE', { changeAdresse: true })).toThrow(
        'L’adresse d’une intervention planifiée ne peut pas changer : retirez-la d’abord de sa tournée.',
      );
    });

    it('nomme le statut en clair dans le refus', () => {
      expect(() => verifierModifiable('TERMINEE', { changeAdresse: false })).toThrow(
        'Une intervention terminée ne peut plus être modifiée.',
      );
    });
  });

  describe('US18 : compte rendu', () => {
    it.each(STATUTS)('intervention %s', (statut) => {
      const completer = () => verifierCompteRenduModifiable(statut);

      if (statut === 'TERMINEE') {
        expect(completer).not.toThrow();
      } else {
        expect(completer).toThrow(BadRequestException);
      }
    });
  });
});
