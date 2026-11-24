import { ConflictException } from '@nestjs/common';
import {
  choisirCouleur,
  PALETTE_PLANNING,
  verifierAucuneIndisponibiliteRecouverte,
  verifierAucuneInterventionRecouverte,
} from './regles-techniciens.js';

describe('recouvrement d’une indisponibilité (RG10)', () => {
  const intervention = (id: number, debut: string, fin: string) => ({
    id,
    debut: new Date(debut),
    fin: new Date(fin),
  });

  it('laisse passer une période libre', () => {
    expect(() => verifierAucuneInterventionRecouverte([])).not.toThrow();
    expect(() => verifierAucuneIndisponibiliteRecouverte([])).not.toThrow();
  });

  it('cite l’intervention recouverte, à l’heure de La Réunion', () => {
    expect(() =>
      verifierAucuneInterventionRecouverte([
        intervention(12, '2026-12-08T04:00:00Z', '2026-12-08T05:00:00Z'),
      ]),
    ).toThrow(
      new ConflictException(
        'La période recouvre une intervention planifiée ou en cours du technicien : ' +
          'n° 12 le 08/12/2026 de 08:00 à 09:00. Retirez-la de sa tournée ou déplacez-la d’abord.',
      ),
    );
  });

  it('cite toutes les interventions recouvertes', () => {
    expect(() =>
      verifierAucuneInterventionRecouverte([
        intervention(12, '2026-12-08T04:00:00Z', '2026-12-08T05:00:00Z'),
        intervention(13, '2026-12-08T06:00:00Z', '2026-12-08T07:30:00Z'),
      ]),
    ).toThrow(
      'des interventions planifiées ou en cours du technicien : n° 12 le 08/12/2026 de 08:00 à 09:00, ' +
        'n° 13 le 08/12/2026 de 10:00 à 11:30. Retirez-les',
    );
  });

  it('cite l’autre indisponibilité recouverte', () => {
    expect(() =>
      verifierAucuneIndisponibiliteRecouverte([
        { debut: new Date('2026-12-10T03:00:00Z'), fin: new Date('2026-12-11T15:00:00Z') },
      ]),
    ).toThrow(
      'La période recouvre une autre indisponibilité du technicien : du 10/12/2026 07:00 au 11/12/2026 19:00.',
    );
  });
});

describe('choix de la couleur du planning', () => {
  it('prend la première couleur quand personne n’en utilise', () => {
    expect(choisirCouleur([])).toBe('#0F766E');
  });

  it('prend la première couleur de la palette encore libre, sans tenir compte de la casse', () => {
    expect(choisirCouleur(['#0f766e', '#1E88E5', '#7B1FA2'])).toBe('#AF4C00');
  });

  it('ignore les couleurs choisies hors de la palette', () => {
    expect(choisirCouleur(['#123456'])).toBe('#0F766E');
  });

  it('prend la couleur la moins utilisée quand toute la palette est prise', () => {
    const toutes = [...PALETTE_PLANNING, ...PALETTE_PLANNING.filter((c) => c !== '#2E7D32')];

    expect(choisirCouleur(toutes)).toBe('#2E7D32');
  });

  it('départage les ex aequo par l’ordre de la palette', () => {
    expect(choisirCouleur([...PALETTE_PLANNING])).toBe('#0F766E');
  });
});
