import { describe, expect, it } from 'vitest';
import type { Indisponibilite } from '../api/types';
import {
  estTerminee,
  memesBornes,
  MESSAGE_PERIODE_INVERSEE,
  MESSAGES_INDISPONIBILITE,
  periodeLisible,
  type SaisieIndisponibilite,
  validerIndisponibilite,
  verifierPeriode,
  versNouvelleIndisponibilite,
  versPeriode,
} from './indisponibilites';

/** Le 27 novembre 2026 de 08:00 à 12:00, heure de La Réunion. */
function saisie(surcharge: Partial<SaisieIndisponibilite> = {}): SaisieIndisponibilite {
  return {
    jourDebut: '2026-11-27',
    heureDebut: '08:00',
    jourFin: '2026-11-27',
    heureFin: '12:00',
    motif: '',
    ...surcharge,
  };
}

const INDISPONIBILITE: Indisponibilite = {
  id: 11,
  debut: '2026-11-27T04:00:00.000Z',
  fin: '2026-11-27T08:00:00.000Z',
  motif: 'Formation',
};

describe('validation d’une indisponibilité (US12)', () => {
  it('US12 : une saisie complète dont la fin suit le début ne signale rien', () => {
    expect(validerIndisponibilite(saisie())).toEqual({});
    expect(validerIndisponibilite(saisie({ jourFin: '2026-11-28', heureFin: '08:00' }))).toEqual(
      {},
    );
  });

  it('US12 : chaque champ vide porte son message, et la fin n’est pas comparée tant qu’il en manque', () => {
    expect(
      validerIndisponibilite({
        jourDebut: '',
        heureDebut: '',
        jourFin: '',
        heureFin: '',
        motif: '',
      }),
    ).toEqual({
      jourDebut: MESSAGES_INDISPONIBILITE.jourDebut,
      heureDebut: MESSAGES_INDISPONIBILITE.heureDebut,
      jourFin: MESSAGES_INDISPONIBILITE.jourFin,
      heureFin: MESSAGES_INDISPONIBILITE.heureFin,
    });
    expect(validerIndisponibilite(saisie({ heureFin: '' }))).toEqual({
      heureFin: MESSAGES_INDISPONIBILITE.heureFin,
    });
  });

  it('US12 : une fin le même jour à la même heure ou avant est signalée sur l’heure de fin', () => {
    expect(validerIndisponibilite(saisie({ heureFin: '08:00' }))).toEqual({
      heureFin: MESSAGES_INDISPONIBILITE.finAvantDebut,
    });
    expect(validerIndisponibilite(saisie({ heureFin: '07:59' }))).toEqual({
      heureFin: MESSAGES_INDISPONIBILITE.finAvantDebut,
    });
  });

  it('US12 : une fin la veille du début est signalée sur la date de fin', () => {
    expect(validerIndisponibilite(saisie({ jourFin: '2026-11-26', heureFin: '18:00' }))).toEqual({
      jourFin: MESSAGES_INDISPONIBILITE.finAvantDebut,
    });
  });

  it('US12 : une date hors du calendrier est refusée comme une date manquante, sans lever', () => {
    // Le moteur tolère « 2026-02-30 » (2 mars) ; un mois 13 donne en revanche une date invalide.
    expect(validerIndisponibilite(saisie({ jourDebut: '2026-13-01' }))).toEqual({
      jourDebut: MESSAGES_INDISPONIBILITE.jourDebut,
    });
  });
});

describe('corps envoyé à l’API (US12)', () => {
  it('US12 : convertit l’heure de La Réunion en instants UTC avec fuseau et omet le motif vide', () => {
    expect(versNouvelleIndisponibilite(saisie({ motif: '   ' }))).toEqual({
      debut: '2026-11-27T04:00:00.000Z',
      fin: '2026-11-27T08:00:00.000Z',
    });
  });

  it('US12 : envoie le motif débarrassé de ses espaces autour', () => {
    expect(versNouvelleIndisponibilite(saisie({ motif: ' Congés ' })).motif).toBe('Congés');
  });
});

describe('période de la liste (US12)', () => {
  it('US12 : seules les bornes renseignées partent ; sans borne, l’objet est vide', () => {
    expect(versPeriode({ du: '', au: '' })).toEqual({});
    expect(versPeriode({ du: '2026-11-01', au: '' })).toEqual({ du: '2026-11-01' });
    expect(versPeriode({ du: '', au: '2026-11-30' })).toEqual({ au: '2026-11-30' });
    expect(versPeriode({ du: '2026-11-01', au: '2026-11-30' })).toEqual({
      du: '2026-11-01',
      au: '2026-11-30',
    });
  });

  it('US12 : un début après la fin reçoit le message exact de l’API, et un seul jour vaut pour les deux', () => {
    expect(verifierPeriode({ du: '2026-12-01', au: '2026-11-30' })).toBe(MESSAGE_PERIODE_INVERSEE);
    expect(verifierPeriode({ du: '2026-11-30', au: '2026-11-30' })).toBeUndefined();
    expect(verifierPeriode({ du: '2026-12-01', au: '' })).toBeUndefined();
  });

  it('US12 : deux saisies sont les mêmes bornes quand du et au sont égaux, pas sinon', () => {
    expect(memesBornes({ du: '2026-12-01', au: '' }, { du: '2026-12-01', au: '' })).toBe(true);
    expect(memesBornes({ du: '2026-12-01', au: '' }, { du: '', au: '2026-12-01' })).toBe(false);
    expect(memesBornes({ du: '', au: '' }, { du: '', au: '2026-12-31' })).toBe(false);
  });
});

describe('présentation d’une indisponibilité (US12)', () => {
  it('US12 : est terminée dès que sa fin est atteinte, pas une minute avant', () => {
    expect(estTerminee(INDISPONIBILITE, new Date('2026-11-27T07:59:00.000Z'))).toBe(false);
    expect(estTerminee(INDISPONIBILITE, new Date('2026-11-27T08:00:00.000Z'))).toBe(true);
  });

  it('US12 : décrit la période à l’heure de La Réunion', () => {
    expect(periodeLisible(INDISPONIBILITE)).toBe('du 27/11/2026 08:00 au 27/11/2026 12:00');
  });
});
