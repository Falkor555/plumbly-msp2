import { describe, expect, it } from 'vitest';
import { deplacer, periodeAffichee } from './navigation';

describe('navigation dans le planning', () => {
  it('demande la semaine du lundi au samedi qui contient le jour affiché', () => {
    expect(periodeAffichee('semaine', '2026-11-26')).toEqual({
      du: '2026-11-23',
      au: '2026-11-28',
    });
  });

  it('demande un seul jour en vue jour', () => {
    expect(periodeAffichee('jour', '2026-11-26')).toEqual({ du: '2026-11-26', au: '2026-11-26' });
  });

  it("passe d'une semaine à l'autre", () => {
    expect(deplacer('semaine', '2026-11-26', 1)).toBe('2026-12-03');
    expect(deplacer('semaine', '2026-11-26', -1)).toBe('2026-11-19');
  });

  it('saute le dimanche en vue jour, dans les deux sens', () => {
    expect(deplacer('jour', '2026-11-28', 1)).toBe('2026-11-30');
    expect(deplacer('jour', '2026-11-30', -1)).toBe('2026-11-28');
    expect(deplacer('jour', '2026-11-24', 1)).toBe('2026-11-25');
  });
});
