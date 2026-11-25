import { describe, expect, it } from 'vitest';
import {
  ajouterJours,
  dateHeureMetier,
  dateMetier,
  heureMetier,
  jourMetier,
  joursOuvres,
  libelleJourCourt,
  lundiDeLaSemaine,
  minutesDansLaJournee,
  periodeTouche,
  versInstant,
} from './dates';

describe('dates du planning (fuseau de La Réunion)', () => {
  it('rattache au jour réunionnais un instant qui est encore la veille en UTC', () => {
    // 21 h 30 UTC le 9 mars = 1 h 30 le 10 mars à La Réunion.
    expect(jourMetier('2026-03-09T21:30:00.000Z')).toBe('2026-03-10');
  });

  it("affiche l'heure de La Réunion et non celle de UTC", () => {
    expect(heureMetier('2026-11-24T04:30:00.000Z')).toBe('08:30');
    expect(minutesDansLaJournee('2026-11-24T04:30:00.000Z')).toBe(8 * 60 + 30);
  });

  it('convertit un jour et une heure saisis en instant UTC', () => {
    expect(versInstant('2026-11-24', '08:00')).toBe('2026-11-24T04:00:00.000Z');
    expect(versInstant('2026-11-24', '00:00')).toBe('2026-11-23T20:00:00.000Z');
  });

  it('trouve le lundi de la semaine, y compris depuis un dimanche', () => {
    expect(lundiDeLaSemaine('2026-11-24')).toBe('2026-11-23');
    expect(lundiDeLaSemaine('2026-11-23')).toBe('2026-11-23');
    expect(lundiDeLaSemaine('2026-11-29')).toBe('2026-11-23');
  });

  it('liste les six jours ouvrés du lundi au samedi, en passant au mois suivant', () => {
    expect(joursOuvres('2026-11-30')).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
    ]);
  });

  it("ajoute ou retire des jours en changeant d'année", () => {
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2027-01-04', -7)).toBe('2026-12-28');
  });

  it('formate un jour sans le décaler, quel que soit le fuseau', () => {
    expect(libelleJourCourt('2026-11-23')).toBe('lun. 23/11');
  });

  it('détecte une indisponibilité qui recouvre le jour, mais pas celle qui finit à minuit', () => {
    // Du lundi 8 h au mardi 12 h, heure de La Réunion.
    const debut = '2026-11-23T04:00:00.000Z';
    const fin = '2026-11-24T08:00:00.000Z';

    expect(periodeTouche('2026-11-23', debut, fin)).toBe(true);
    expect(periodeTouche('2026-11-24', debut, fin)).toBe(true);
    expect(periodeTouche('2026-11-25', debut, fin)).toBe(false);
    expect(
      periodeTouche('2026-11-24', '2026-11-23T04:00:00.000Z', '2026-11-23T20:00:00.000Z'),
    ).toBe(false);
  });
});

describe('dates complètes affichées (fuseau de La Réunion)', () => {
  it('US09 : écrit une date JJ/MM/AAAA et une date-heure JJ/MM/AAAA HH:MM', () => {
    expect(dateMetier('2026-11-24T04:30:00.000Z')).toBe('24/11/2026');
    expect(dateHeureMetier('2026-11-24T04:30:00.000Z')).toBe('24/11/2026 08:30');
  });

  it('US09 : affiche minuit UTC à 04:00, heure de La Réunion', () => {
    expect(dateHeureMetier('2026-11-24T00:00:00.000Z')).toBe('24/11/2026 04:00');
  });

  it('US12 : passe au jour, au mois et à l’année suivants quand il est déjà minuit à La Réunion', () => {
    // 20 h UTC le 31 décembre = minuit le 1er janvier à La Réunion.
    expect(dateHeureMetier('2026-12-31T20:00:00.000Z')).toBe('01/01/2027 00:00');
    expect(dateMetier(new Date('2026-12-31T19:59:00.000Z'))).toBe('31/12/2026');
  });
});
