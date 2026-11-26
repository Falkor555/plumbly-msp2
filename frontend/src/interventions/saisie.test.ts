import { describe, expect, it } from 'vitest';
import { avecType, erreursDeLaSaisie, SAISIE_VIDE, versNouvelleIntervention } from './saisie';

const DEBOUCHAGE = { id: 3, libelle: 'Débouchage', dureeDefautMin: 45 };

describe('saisie d’une intervention (US14)', () => {
  it('US14 : choisir un type préremplit la durée avec sa durée par défaut', () => {
    expect(avecType({ ...SAISIE_VIDE, dureeEstimeeMin: '90' }, DEBOUCHAGE)).toMatchObject({
      typeInterventionId: '3',
      dureeEstimeeMin: '45',
    });
  });

  it('US14 : signale en une fois tout ce qui manque avant l’envoi', () => {
    expect(erreursDeLaSaisie({ ...SAISIE_VIDE, description: '   ' })).toEqual([
      'Choisissez le client, puis l’adresse de l’intervention.',
      'Choisissez le type d’intervention.',
      'La durée estimée doit être un nombre entier de minutes, entre 15 et 720.',
      'Décrivez la demande du client.',
    ]);
  });

  it('US14 : refuse une durée hors de 15 à 720 minutes et une description trop longue', () => {
    const saisie = { ...avecType({ ...SAISIE_VIDE, adresseId: 15 }, DEBOUCHAGE) };
    expect(erreursDeLaSaisie({ ...saisie, dureeEstimeeMin: '10', description: 'Fuite' })).toEqual([
      'La durée estimée doit être un nombre entier de minutes, entre 15 et 720.',
    ]);
    expect(
      erreursDeLaSaisie({ ...saisie, dureeEstimeeMin: '721', description: 'x'.repeat(1001) }),
    ).toHaveLength(2);
  });

  it('US14 : envoie des nombres et une description sans espaces autour', () => {
    const saisie = avecType(
      { ...SAISIE_VIDE, adresseId: 15, description: ' Évier bouché ' },
      DEBOUCHAGE,
    );
    expect(versNouvelleIntervention({ ...saisie, urgence: 'URGENTE' })).toEqual({
      adresseId: 15,
      typeInterventionId: 3,
      description: 'Évier bouché',
      urgence: 'URGENTE',
      dureeEstimeeMin: 45,
    });
  });
});
