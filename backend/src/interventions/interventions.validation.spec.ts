import { BadRequestException } from '@nestjs/common';
import { enDataUrl, fabriquerPng } from '../../test/support/fabriquer-png.js';
import {
  lireAnnulation,
  lireCompteRendu,
  lireDemarrage,
  lireFiltresInterventions,
  lireFinDIntervention,
  lireModificationIntervention,
  lireNouvelleIntervention,
} from './interventions.validation.js';
import { MESSAGE_PNG_INVALIDE } from './signature-png.js';

function erreursDe(lecture: () => unknown): string[] {
  try {
    lecture();
  } catch (erreur) {
    if (erreur instanceof BadRequestException) {
      return (erreur.getResponse() as { message: string[] }).message;
    }
    throw erreur;
  }
  throw new Error('La lecture aurait dû être refusée.');
}

const NOUVELLE = {
  adresseId: 15,
  typeInterventionId: 1,
  description: 'Fuite sous l’évier',
  urgence: 'PRIORITAIRE',
};

describe('validation des interventions', () => {
  describe('POST /interventions', () => {
    it('lit une intervention valide sans durée (celle du type sera reprise)', () => {
      expect(lireNouvelleIntervention({ ...NOUVELLE, description: '  Fuite  ' })).toEqual({
        ...NOUVELLE,
        description: 'Fuite',
      });
    });

    it('garde la durée envoyée', () => {
      expect(lireNouvelleIntervention({ ...NOUVELLE, dureeEstimeeMin: 90 }).dureeEstimeeMin).toBe(
        90,
      );
    });

    it('liste toutes les erreurs d’un corps vide', () => {
      expect(erreursDe(() => lireNouvelleIntervention({}))).toEqual([
        'adresseId doit être un entier positif',
        'typeInterventionId doit être un entier positif',
        'description est obligatoire',
        'urgence doit être NORMALE, PRIORITAIRE ou URGENTE',
      ]);
    });

    it.each([
      ['vide', ''],
      ['faite d’espaces', '   '],
    ])('refuse une description %s', (_cas, description) => {
      expect(erreursDe(() => lireNouvelleIntervention({ ...NOUVELLE, description }))).toEqual([
        'description ne peut pas être vide',
      ]);
    });

    it('accepte 1 000 caractères et refuse 1 001', () => {
      expect(
        lireNouvelleIntervention({ ...NOUVELLE, description: 'a'.repeat(1000) }).description,
      ).toHaveLength(1000);
      expect(
        erreursDe(() => lireNouvelleIntervention({ ...NOUVELLE, description: 'a'.repeat(1001) })),
      ).toEqual(['description ne doit pas dépasser 1000 caractères']);
    });

    it.each([
      [14, false],
      [15, true],
      [720, true],
      [721, false],
      [0, false],
      [30.5, false],
    ])('durée de %s minutes acceptée : %s', (dureeEstimeeMin, acceptee) => {
      const lire = () => lireNouvelleIntervention({ ...NOUVELLE, dureeEstimeeMin });

      if (acceptee) {
        expect(lire().dureeEstimeeMin).toBe(dureeEstimeeMin);
      } else {
        expect(erreursDe(lire)).toEqual([
          'dureeEstimeeMin doit être un nombre entier de minutes entre 15 et 720',
        ]);
      }
    });

    it('refuse une urgence inconnue avec le message du contrat', () => {
      expect(
        erreursDe(() => lireNouvelleIntervention({ ...NOUVELLE, urgence: 'urgente' })),
      ).toEqual(['urgence doit être NORMALE, PRIORITAIRE ou URGENTE']);
    });

    it.each(['statut', 'clientId', 'idTournee', 'ordreTournee'])(
      'refuse le champ %s, qui ne s’envoie pas à la création',
      (champ) => {
        expect(erreursDe(() => lireNouvelleIntervention({ ...NOUVELLE, [champ]: 1 }))).toEqual([
          `Le champ ${champ} n’est pas autorisé`,
        ]);
      },
    );
  });

  describe('GET /interventions', () => {
    it('trie par défaut par urgence décroissante, 20 par page', () => {
      expect(lireFiltresInterventions({})).toEqual({ page: 1, limit: 20, tri: '-urgence' });
    });

    it('lit tous les filtres ensemble', () => {
      expect(
        lireFiltresInterventions({
          page: '2',
          limit: '100',
          recherche: ' helene ',
          statut: 'A_PLANIFIER,PLANIFIEE,A_PLANIFIER',
          urgence: 'URGENTE',
          technicienId: '2',
          clientId: '8',
          du: '2026-12-07',
          au: '2026-12-12',
          tri: '-creeLe',
        }),
      ).toEqual({
        page: 2,
        limit: 100,
        recherche: 'helene',
        statuts: ['A_PLANIFIER', 'PLANIFIEE'],
        urgence: 'URGENTE',
        technicienId: 2,
        clientId: 8,
        du: '2026-12-07',
        au: '2026-12-12',
        tri: '-creeLe',
      });
    });

    it('nomme le statut refusé dans une liste', () => {
      expect(erreursDe(() => lireFiltresInterventions({ statut: 'A_PLANIFIER,FOO' }))).toEqual([
        'statut doit contenir un ou plusieurs statuts séparés par des virgules parmi A_PLANIFIER, PLANIFIEE, EN_COURS, TERMINEE, ANNULEE (refusé : FOO)',
      ]);
    });

    it.each([
      ['un statut vide', { statut: '' }],
      ['une virgule finale', { statut: 'A_PLANIFIER,' }],
      ['un statut répété en paramètre', { statut: ['A_PLANIFIER', 'PLANIFIEE'] }],
      ['un tri inconnu', { tri: 'urgence' }],
      ['un technicien non numérique', { technicienId: '1e3' }],
      ['un client à zéro', { clientId: '0' }],
      ['une date impossible', { du: '2026-02-30' }],
      ['du après au', { du: '2026-12-12', au: '2026-12-07' }],
      ['une limite de 101', { limit: '101' }],
      ['une recherche d’un caractère', { recherche: 'a' }],
      ['un paramètre inconnu', { archives: 'true' }],
      ['du SQL dans un filtre', { urgence: "' OR 1=1 --" }],
    ])('refuse %s', (_cas, requete) => {
      expect(() => lireFiltresInterventions(requete)).toThrow(BadRequestException);
    });

    it('accepte du seul ou au seul', () => {
      expect(lireFiltresInterventions({ du: '2026-12-07' }).du).toBe('2026-12-07');
      expect(lireFiltresInterventions({ au: '2026-12-07' }).au).toBe('2026-12-07');
    });
  });

  describe('PATCH /interventions/:id', () => {
    it('ne garde que les champs envoyés', () => {
      expect(lireModificationIntervention({ urgence: 'URGENTE', dureeEstimeeMin: 30 })).toEqual({
        urgence: 'URGENTE',
        dureeEstimeeMin: 30,
      });
    });

    it('refuse une modification vide', () => {
      expect(erreursDe(() => lireModificationIntervention({}))).toEqual(['Aucun champ à modifier']);
    });

    it.each(['statut', 'idTournee', 'ordreTournee', 'debutPrevu'])(
      'refuse le champ %s : il ne se modifie que par les routes d’action et des tournées',
      (champ) => {
        expect(erreursDe(() => lireModificationIntervention({ [champ]: 1 }))).toEqual([
          `Le champ ${champ} n’est pas autorisé`,
        ]);
      },
    );

    it('refuse null sur la description', () => {
      expect(erreursDe(() => lireModificationIntervention({ description: null }))).toEqual([
        'description ne peut pas être null',
      ]);
    });
  });

  describe('POST /interventions/:id/cancel', () => {
    it('retire les espaces autour du motif', () => {
      expect(lireAnnulation({ motif: '  Client absent  ' })).toEqual({ motif: 'Client absent' });
    });

    it.each([
      ['absent', {}, 'motif est obligatoire'],
      ['vide', { motif: '' }, 'motif ne peut pas être vide'],
      ['fait d’espaces', { motif: '   ' }, 'motif ne peut pas être vide'],
      ['trop long', { motif: 'a'.repeat(501) }, 'motif ne doit pas dépasser 500 caractères'],
    ])('refuse un motif %s', (_cas, corps, message) => {
      expect(erreursDe(() => lireAnnulation(corps))).toEqual([message]);
    });

    it('accepte un motif de 500 caractères', () => {
      expect(lireAnnulation({ motif: 'a'.repeat(500) }).motif).toHaveLength(500);
    });
  });

  describe('POST /interventions/:id/start', () => {
    it('accepte un corps absent ou vide', () => {
      expect(() => lireDemarrage(undefined)).not.toThrow();
      expect(() => lireDemarrage({})).not.toThrow();
    });

    it('refuse un corps qui porte un champ', () => {
      expect(erreursDe(() => lireDemarrage({ demarreeLe: '2026-12-07T08:00:00Z' }))).toEqual([
        'Le champ demarreeLe n’est pas autorisé',
      ]);
    });
  });

  describe('compte rendu (complete et report)', () => {
    it('complete : le compte rendu est facultatif, même sans corps', () => {
      expect(lireFinDIntervention(undefined)).toEqual({});
      expect(lireFinDIntervention({ compteRendu: ' Joint changé ' })).toEqual({
        compteRendu: 'Joint changé',
      });
    });

    it('accepte 2 000 caractères et refuse 2 001, aux deux routes', () => {
      expect(lireCompteRendu({ compteRendu: 'a'.repeat(2000) }).compteRendu).toHaveLength(2000);
      expect(erreursDe(() => lireCompteRendu({ compteRendu: 'a'.repeat(2001) }))).toEqual([
        'compteRendu ne doit pas dépasser 2000 caractères',
      ]);
      expect(erreursDe(() => lireFinDIntervention({ compteRendu: 'a'.repeat(2001) }))).toEqual([
        'compteRendu ne doit pas dépasser 2000 caractères',
      ]);
    });

    it('report : le compte rendu est obligatoire et non vide', () => {
      expect(erreursDe(() => lireCompteRendu({}))).toEqual(['compteRendu est obligatoire']);
      expect(erreursDe(() => lireCompteRendu({ compteRendu: '  ' }))).toEqual([
        'compteRendu ne peut pas être vide',
      ]);
    });

    it('refuse un champ inconnu', () => {
      expect(erreursDe(() => lireCompteRendu({ compteRendu: 'Ok', statut: 'TERMINEE' }))).toEqual([
        'Le champ statut n’est pas autorisé',
      ]);
    });
  });

  describe('signature du client (complete, US33)', () => {
    const PNG = fabriquerPng();
    const IMAGE = enDataUrl(PNG);
    const SIGNATURE = { image: IMAGE, nomSignataire: ' Jean Dupont ' };

    it('lit la signature avec son compte rendu, espaces des extrémités retirés', () => {
      const fin = lireFinDIntervention({ compteRendu: ' Joint changé ', signature: SIGNATURE });

      expect(fin).toEqual({
        compteRendu: 'Joint changé',
        signature: { nomSignataire: 'Jean Dupont', image: expect.any(Buffer) },
      });
      expect(Buffer.compare(fin.signature?.image as Buffer, PNG)).toBe(0);
    });

    it('accepte un nom de 100 caractères et refuse 101', () => {
      const avec = (nomSignataire: string) => () =>
        lireFinDIntervention({ compteRendu: 'Ok', signature: { image: IMAGE, nomSignataire } });

      expect(avec('a'.repeat(100))().signature?.nomSignataire).toHaveLength(100);
      expect(erreursDe(avec('a'.repeat(101)))).toEqual([
        'signature.nomSignataire ne doit pas dépasser 100 caractères',
      ]);
    });

    it('RG31 : refuse une signature sans compte rendu', () => {
      expect(erreursDe(() => lireFinDIntervention({ signature: SIGNATURE }))).toEqual([
        'compteRendu est obligatoire',
      ]);
      expect(
        erreursDe(() => lireFinDIntervention({ compteRendu: '  ', signature: SIGNATURE })),
      ).toEqual(['compteRendu ne peut pas être vide']);
    });

    it('RG31 : refuse une signature sans nom ou avec un nom vide', () => {
      expect(
        erreursDe(() => lireFinDIntervention({ compteRendu: 'Ok', signature: { image: IMAGE } })),
      ).toEqual(['signature.nomSignataire est obligatoire']);
      expect(
        erreursDe(() =>
          lireFinDIntervention({
            compteRendu: 'Ok',
            signature: { image: IMAGE, nomSignataire: '   ' },
          }),
        ),
      ).toEqual(['signature.nomSignataire ne peut pas être vide']);
    });

    it('refuse un nom contenant le caractère NUL', () => {
      const signature = { image: IMAGE, nomSignataire: 'Jean\u0000Dupont' };

      expect(erreursDe(() => lireFinDIntervention({ compteRendu: 'Ok', signature }))).toEqual([
        'signature.nomSignataire contient un caractère non autorisé',
      ]);
    });

    it('refuse une signature sans image, ou dont l’image n’est pas un texte', () => {
      expect(
        erreursDe(() =>
          lireFinDIntervention({ compteRendu: 'Ok', signature: { nomSignataire: 'Jean' } }),
        ),
      ).toEqual(['signature.image est obligatoire']);
      expect(
        erreursDe(() =>
          lireFinDIntervention({
            compteRendu: 'Ok',
            signature: { image: 3, nomSignataire: 'Jean' },
          }),
        ),
      ).toEqual(['signature.image doit être un texte']);
    });

    it('refuse une image qui n’est pas un PNG valide', () => {
      const signature = { image: enDataUrl(PNG, 'data:image/jpeg;base64,'), nomSignataire: 'Jean' };

      expect(erreursDe(() => lireFinDIntervention({ compteRendu: 'Ok', signature }))).toEqual([
        MESSAGE_PNG_INVALIDE,
      ]);
    });

    it('refuse un champ inconnu dans la signature', () => {
      const signature = { ...SIGNATURE, signeeLe: '2026-11-25T08:00:00Z', empreinte: 'abc' };

      expect(erreursDe(() => lireFinDIntervention({ compteRendu: 'Ok', signature }))).toEqual([
        'Le champ signature.signeeLe n’est pas autorisé',
        'Le champ signature.empreinte n’est pas autorisé',
      ]);
    });

    it.each([
      ['null', null, ['signature ne peut pas être null']],
      ['un texte', IMAGE, ['signature doit être un objet']],
      ['un tableau', [IMAGE], ['signature doit être un objet']],
    ])('refuse une signature qui vaut %s', (_cas, signature, erreurs) => {
      expect(erreursDe(() => lireFinDIntervention({ signature }))).toEqual(erreurs);
    });

    it('réunit toutes les erreurs du corps dans un seul 400', () => {
      const corps = {
        compteRendu: 'a'.repeat(2001),
        signature: { image: 'data:image/svg+xml;base64,PHN2Zy8+', nomSignataire: '' },
      };

      expect(erreursDe(() => lireFinDIntervention(corps))).toEqual([
        'compteRendu ne doit pas dépasser 2000 caractères',
        'signature.nomSignataire ne peut pas être vide',
        MESSAGE_PNG_INVALIDE,
      ]);
    });
  });
});
