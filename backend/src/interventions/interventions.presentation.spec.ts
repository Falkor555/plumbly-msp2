import { estEnRetard } from './interventions.presentation.js';

const DEBUT = new Date('2026-12-08T09:00:00+04:00');

describe('RG20 : intervention en retard', () => {
  it.each([
    ['planifiée, 16 minutes après le début', 'PLANIFIEE', '09:16', true],
    ['planifiée, 15 minutes après le début', 'PLANIFIEE', '09:15', false],
    ['déjà démarrée', 'EN_COURS', '10:00', false],
  ] as const)('%s → %s', (_cas, statut, heure, attendu) => {
    const maintenant = new Date(`2026-12-08T${heure}:00+04:00`);

    expect(estEnRetard({ statut, debutPrevu: DEBUT }, maintenant)).toBe(attendu);
  });

  it('ne signale pas une intervention sans début prévu', () => {
    expect(estEnRetard({ statut: 'PLANIFIEE', debutPrevu: null }, new Date())).toBe(false);
  });
});
