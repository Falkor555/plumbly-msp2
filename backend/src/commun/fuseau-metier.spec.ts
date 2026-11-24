import {
  ajouterJours,
  debutDuJourMetier,
  heureMetier,
  jourDeLaSemaine,
  jourMetier,
  minutesDepuisMinuitMetier,
} from './fuseau-metier.js';

describe('fuseau métier (Indian/Reunion, UTC+4)', () => {
  it('rattache un instant UTC du soir au lendemain à La Réunion', () => {
    const instant = new Date('2026-12-07T21:30:00Z');

    const jour = jourMetier(instant);

    expect(jour).toBe('2026-12-08');
  });

  it('donne l’heure locale de La Réunion', () => {
    const instant = new Date('2026-12-08T04:05:00Z');

    expect(heureMetier(instant)).toBe('08:05');
    expect(minutesDepuisMinuitMetier(instant)).toBe(8 * 60 + 5);
  });

  it('place minuit à La Réunion à 20 h UTC la veille', () => {
    const debut = debutDuJourMetier('2026-12-08');

    expect(debut.toISOString()).toBe('2026-12-07T20:00:00.000Z');
  });

  it('change de mois et d’année en ajoutant des jours', () => {
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('reconnaît le dimanche et le lundi', () => {
    expect(jourDeLaSemaine('2026-12-13')).toBe(0);
    expect(jourDeLaSemaine('2026-12-07')).toBe(1);
  });
});
