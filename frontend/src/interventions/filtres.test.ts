import { describe, expect, it } from 'vitest';
import { depuisBrouillon, erreursDuBrouillon, lireFiltres, versParametres } from './filtres';

describe('filtres de la liste des interventions (US15)', () => {
  it('US15 : lit les filtres de l’adresse et les réécrit à l’identique', () => {
    const adresse =
      'recherche=dupont&statut=A_PLANIFIER&urgence=URGENTE&du=2026-11-23&au=2026-11-28&page=2';
    expect(versParametres(lireFiltres(new URLSearchParams(adresse))).toString()).toBe(adresse);
  });

  it('US15 : ignore une valeur inconnue saisie à la main dans l’adresse', () => {
    expect(
      lireFiltres(new URLSearchParams('statut=nimporte&urgence=TRES&du=hier&page=-3&recherche=a')),
    ).toEqual({ page: 1 });
  });

  it('US15 : signale une recherche d’un caractère et une période inversée avant l’envoi', () => {
    expect(
      erreursDuBrouillon({
        recherche: ' a ',
        statut: '',
        urgence: '',
        du: '2026-11-28',
        au: '2026-11-23',
      }),
    ).toEqual([
      'La recherche doit contenir au moins 2 caractères.',
      'La date de début doit précéder la date de fin.',
    ]);
  });

  it('US15 : un filtre appliqué repart de la première page, sans les champs vides', () => {
    expect(
      depuisBrouillon({ recherche: ' dupont ', statut: 'EN_COURS', urgence: '', du: '', au: '' }),
    ).toEqual({ page: 1, recherche: 'dupont', statut: 'EN_COURS' });
  });
});
