import { describe, expect, it } from 'vitest';
import { jourMetier } from '../commun/dates';
import {
  depuisBrouillon,
  erreursDuBrouillon,
  filtresPrets,
  lireFiltres,
  memesFiltres,
  versParametres,
} from './filtres';

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

describe('filtres prêts à l’emploi (#49)', () => {
  const parametres = (aujourdhui: string) =>
    Object.fromEntries(
      filtresPrets(aujourdhui).map(({ libelle, filtres }) => [
        libelle,
        versParametres(filtres).toString(),
      ]),
    );

  it('US15 : chaque filtre prêt envoie les bons paramètres', () => {
    expect(parametres('2026-11-26')).toEqual({
      'Urgentes à planifier': 'statut=A_PLANIFIER&urgence=URGENTE',
      'À planifier': 'statut=A_PLANIFIER',
      'En cours': 'statut=EN_COURS',
      'Aujourd’hui': 'du=2026-11-26&au=2026-11-26',
      'Cette semaine': 'du=2026-11-23&au=2026-11-29',
    });
  });

  it('US15 : « Aujourd’hui » prend le jour de La Réunion, déjà le lendemain à 23 h 30 UTC', () => {
    // 23 h 30 UTC le 24 novembre = 3 h 30 le 25 novembre à La Réunion (UTC+4).
    const aujourdhui = jourMetier(new Date('2026-11-24T23:30:00.000Z'));
    expect(parametres(aujourdhui)['Aujourd’hui']).toBe('du=2026-11-25&au=2026-11-25');
  });

  it('US15 : « Cette semaine » va du lundi au dimanche, y compris un dimanche', () => {
    expect(parametres('2026-11-29')['Cette semaine']).toBe('du=2026-11-23&au=2026-11-29');
  });

  it('US15 : reconnaît le filtre prêt actif sur n’importe quelle page', () => {
    const [urgentes, aPlanifier] = filtresPrets('2026-11-26');
    expect(memesFiltres({ ...urgentes.filtres, page: 3 }, urgentes.filtres)).toBe(true);
    expect(memesFiltres(aPlanifier.filtres, urgentes.filtres)).toBe(false);
  });
});
