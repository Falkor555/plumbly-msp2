import { describe, expect, it } from 'vitest';
import { nombreDInterventions } from './presentation';

describe("nombre d'interventions", () => {
  it('reste au singulier pour zéro ou une intervention', () => {
    expect(nombreDInterventions(0)).toBe('0 intervention');
    expect(nombreDInterventions(1)).toBe('1 intervention');
  });

  it('passe au pluriel à partir de deux interventions', () => {
    expect(nombreDInterventions(2)).toBe('2 interventions');
  });
});
