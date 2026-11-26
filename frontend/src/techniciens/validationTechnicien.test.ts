import { describe, expect, it } from 'vitest';
import { MESSAGES_TELEPHONE } from '../commun/telephone';
import { karimDeTest } from '../test/techniciensDeTest';
import {
  lireIdentifiantDuCompte,
  MESSAGES_TECHNICIEN,
  type SaisieNouveauTechnicien,
  saisieDuTechnicien,
  validerNouveauTechnicien,
  validerTechnicien,
  versModificationTechnicien,
  versNouveauTechnicien,
} from './validationTechnicien';

function nouveau(surcharge: Partial<SaisieNouveauTechnicien> = {}): SaisieNouveauTechnicien {
  return { compte: '14', telephone: '0692 11 22 33', couleur: null, ...surcharge };
}

describe('identifiant du compte saisi (US11)', () => {
  it.each([
    ['12', 12],
    [' 12 ', 12],
    ['0012', 12],
    ['2147483647', 2147483647],
  ])('US11 : lit « %s » comme le compte %d', (saisie, attendu) => {
    expect(lireIdentifiantDuCompte(saisie)).toBe(attendu);
  });

  it.each([['0'], ['-3'], ['1.5'], ['12a'], ['1e3'], ['2147483648'], ['']])(
    'US11 : refuse « %s », qui ne peut désigner aucun compte',
    (saisie) => {
      expect(lireIdentifiantDuCompte(saisie)).toBeNull();
    },
  );
});

describe('validation de la création (US11)', () => {
  it('US11 : une saisie complète ne signale rien', () => {
    expect(validerNouveauTechnicien(nouveau(), 'identifiant')).toEqual({});
    expect(validerNouveauTechnicien(nouveau(), 'liste')).toEqual({});
  });

  it('US11 : un identifiant vide ou invalide est signalé avec un exemple', () => {
    expect(validerNouveauTechnicien(nouveau({ compte: '  ' }), 'identifiant')).toEqual({
      compte: MESSAGES_TECHNICIEN.identifiantObligatoire,
    });
    expect(validerNouveauTechnicien(nouveau({ compte: 'sept' }), 'identifiant')).toEqual({
      compte: MESSAGES_TECHNICIEN.identifiantInvalide,
    });
  });

  it('US11 : sans compte choisi dans la liste, demande de le choisir', () => {
    expect(validerNouveauTechnicien(nouveau({ compte: '' }), 'liste')).toEqual({
      compte: 'Choisissez le compte du technicien dans la liste.',
    });
  });

  it('US11 : le téléphone est obligatoire, au même format que l’API', () => {
    expect(validerNouveauTechnicien(nouveau({ telephone: '' }), 'identifiant')).toEqual({
      telephone: MESSAGES_TELEPHONE.obligatoire,
    });
    expect(validerNouveauTechnicien(nouveau({ telephone: '0692-11' }), 'identifiant')).toEqual({
      telephone: MESSAGES_TELEPHONE.invalide,
    });
  });
});

describe('corps de POST /technicians (US11)', () => {
  it('US11 : envoie l’identifiant en nombre et le téléphone sans espaces, sans couleur non choisie', () => {
    expect(versNouveauTechnicien(nouveau({ compte: ' 0014 ' }))).toEqual({
      utilisateurId: 14,
      telephone: '0692112233',
    });
  });

  it('US11 : envoie la couleur choisie en majuscules', () => {
    expect(versNouveauTechnicien(nouveau({ couleur: '#7b1fa2' }))).toEqual({
      utilisateurId: 14,
      telephone: '0692112233',
      couleurPlanning: '#7B1FA2',
    });
  });
});

describe('modification de la fiche (US11)', () => {
  it('US11 : la saisie part de la fiche, couleur en majuscules', () => {
    expect(saisieDuTechnicien({ ...karimDeTest(), couleurPlanning: '#1e88e5' })).toEqual({
      telephone: '0692123456',
      couleur: '#1E88E5',
    });
  });

  it('US11 : un téléphone vidé est signalé', () => {
    expect(validerTechnicien({ telephone: ' ', couleur: '#1E88E5' })).toEqual({
      telephone: MESSAGES_TELEPHONE.obligatoire,
    });
  });

  it('US11 : n’envoie que les champs changés, rien pour une fiche inchangée', () => {
    const karim = karimDeTest();

    expect(
      versModificationTechnicien(karim, { telephone: '0693 99 88 77', couleur: '#1E88E5' }),
    ).toEqual({
      telephone: '0693998877',
    });
    expect(
      versModificationTechnicien(karim, { telephone: '0692123456', couleur: '#c62828' }),
    ).toEqual({
      couleurPlanning: '#C62828',
    });
    expect(versModificationTechnicien(karim, saisieDuTechnicien(karim))).toEqual({});
  });

  it('US11 : le même numéro écrit avec des espaces, ou la même couleur en minuscules, ne changent rien', () => {
    expect(
      versModificationTechnicien(karimDeTest(), {
        telephone: '06 92 12 34 56',
        couleur: '#1e88e5',
      }),
    ).toEqual({});
  });
});
