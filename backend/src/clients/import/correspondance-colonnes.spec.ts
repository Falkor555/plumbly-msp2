import { BadRequestException } from '@nestjs/common';
import { etablirCorrespondance, normaliserEnTete } from './correspondance-colonnes.js';

function messagesDe(action: () => unknown): unknown {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof BadRequestException) {
      return (erreur.getResponse() as { message: unknown }).message;
    }
    throw erreur;
  }
  throw new Error('Aucune erreur 400 levée');
}

const OBLIGATOIRES = ['nom', 'telephone', 'rue', 'code_postal', 'ville'];

describe('correspondance des colonnes', () => {
  describe('normaliserEnTete', () => {
    it.each([
      ['Tel', 'tel'],
      ['Tél.', 'tel'],
      ['Téléphone', 'telephone'],
      ['MOBILE', 'mobile'],
      ['Courriel', 'courriel'],
      ['Code postal', 'codepostal'],
      ['code-postal', 'codepostal'],
      ['E-mail', 'email'],
      ['  Raison_Sociale ', 'raisonsociale'],
    ])('« %s » devient « %s »', (enTete, attendu) => {
      expect(normaliserEnTete(enTete)).toBe(attendu);
    });
  });

  describe('proposition', () => {
    it.each([
      ['Tel', 'telephone'],
      ['Tél.', 'telephone'],
      ['Téléphone', 'telephone'],
      ['MOBILE', 'telephone'],
      ['Portable', 'telephone'],
      ['Numéro de contact', 'telephone'],
      ['Courriel', 'emailClient'],
      ['e-mail', 'emailClient'],
      ['Code postal', 'codePostal'],
      ['code-postal', 'codePostal'],
      ['CP', 'codePostal'],
      ['Adresse', 'rue'],
      ['Adresse 2', 'complement'],
      ['Commune', 'ville'],
      ['Digicode', 'infosAcces'],
      ['Société', 'raisonSociale'],
      ['type_client', 'typeClient'],
      ['Prénom', 'prenomClient'],
    ])('rattache « %s » au champ %s', (enTete, champ) => {
      // En première colonne : elle prend son champ même si une colonne suivante y prétend aussi.
      const { correspondance } = etablirCorrespondance([enTete, ...OBLIGATOIRES]);

      expect(correspondance[enTete]).toBe(champ);
    });

    it('reconnaît toutes les colonnes d’un export des clients et ignore id, archive et cree_le', () => {
      const enTetes = [
        'id',
        'type_client',
        'nom',
        'prenom',
        'raison_sociale',
        'telephone',
        'email',
        'rue',
        'complement',
        'code_postal',
        'ville',
        'infos_acces',
        'archive',
        'cree_le',
      ];

      const etablie = etablirCorrespondance(enTetes);

      expect(etablie.champsParColonne).toEqual([
        null,
        'typeClient',
        'nomClient',
        'prenomClient',
        'raisonSociale',
        'telephone',
        'emailClient',
        'rue',
        'complement',
        'codePostal',
        'ville',
        'infosAcces',
        null,
        null,
      ]);
      expect(etablie.colonnesIgnorees).toEqual(['id', 'archive', 'cree_le']);
    });

    it('ignore une colonne inconnue et la liste dans colonnesIgnorees', () => {
      const etablie = etablirCorrespondance([...OBLIGATOIRES, 'remarque']);

      expect(etablie.correspondance.remarque).toBeNull();
      expect(etablie.colonnesIgnorees).toEqual(['remarque']);
    });

    it('donne le champ à la première de deux colonnes candidates (Tel et Mobile), ignore la seconde', () => {
      const etablie = etablirCorrespondance(['nom', 'Tel', 'Mobile', 'rue', 'cp', 'ville']);

      expect(etablie.correspondance).toMatchObject({ Tel: 'telephone', Mobile: null });
      expect(etablie.colonnesIgnorees).toEqual(['Mobile']);
    });

    it('renvoie la correspondance dans l’ordre des colonnes du fichier', () => {
      const { correspondance } = etablirCorrespondance(['ville', 'nom', 'cp', 'rue', 'tel']);

      expect(Object.keys(correspondance)).toEqual(['ville', 'nom', 'cp', 'rue', 'tel']);
    });
  });

  describe('correspondance envoyée', () => {
    it('remplace la proposition pour les colonnes citées seulement', () => {
      const { correspondance } = etablirCorrespondance(
        ['nom', 'Tel', 'Mobile', 'rue', 'cp', 'ville'],
        {
          Mobile: 'telephone',
          Tel: null,
        },
      );

      expect(correspondance).toEqual({
        nom: 'nomClient',
        Tel: null,
        Mobile: 'telephone',
        rue: 'rue',
        cp: 'codePostal',
        ville: 'ville',
      });
    });

    it('l’emporte sur la proposition d’une autre colonne pour le même champ', () => {
      const { correspondance } = etablirCorrespondance(
        ['nom', 'Tel', 'Mobile', 'rue', 'cp', 'ville'],
        {
          Mobile: 'telephone',
        },
      );

      expect(correspondance).toMatchObject({ Tel: null, Mobile: 'telephone' });
    });

    it('rattache une colonne non reconnue au champ choisi', () => {
      const { correspondance } = etablirCorrespondance([...OBLIGATOIRES, 'Lieu-dit'], {
        'Lieu-dit': 'complement',
      });

      expect(correspondance['Lieu-dit']).toBe('complement');
    });

    it('ignore une colonne reconnue quand on lui associe null', () => {
      const etablie = etablirCorrespondance([...OBLIGATOIRES, 'email'], { email: null });

      expect(etablie.correspondance.email).toBeNull();
      expect(etablie.colonnesIgnorees).toEqual(['email']);
    });

    it('refuse un en-tête absent du fichier et un champ inconnu', () => {
      expect(
        messagesDe(() =>
          etablirCorrespondance(OBLIGATOIRES, {
            portable: 'telephone',
            nom: 'nomDeFamille' as never,
          }),
        ),
      ).toEqual([
        'correspondance cite un en-tête absent du fichier : « portable »',
        'correspondance « nom » doit valoir typeClient, nomClient, prenomClient, raisonSociale, ' +
          'telephone, emailClient, rue, complement, codePostal, ville, infosAcces ou null',
      ]);
    });

    it('refuse un champ choisi pour deux colonnes', () => {
      expect(
        messagesDe(() =>
          etablirCorrespondance([...OBLIGATOIRES, 'fixe', 'mobile'], {
            fixe: 'telephone',
            mobile: 'telephone',
          }),
        ),
      ).toEqual(['Le champ telephone est choisi pour plusieurs colonnes']);
    });

    it('ne se laisse pas tromper par un en-tête qui porte le nom d’une propriété d’objet', () => {
      const etablie = etablirCorrespondance([...OBLIGATOIRES, 'constructor', '__proto__']);

      expect(etablie.colonnesIgnorees).toEqual(['constructor', '__proto__']);
    });
  });

  describe('contrôles du fichier', () => {
    it('refuse deux colonnes au même en-tête, en donnant leurs numéros', () => {
      expect(messagesDe(() => etablirCorrespondance([...OBLIGATOIRES, 'nom']))).toEqual([
        'Les colonnes 1 et 6 portent le même en-tête',
      ]);
    });

    it('refuse chaque champ obligatoire sans colonne', () => {
      expect(messagesDe(() => etablirCorrespondance(['prenom', 'email']))).toEqual([
        'Aucune colonne pour le champ obligatoire telephone',
        'Aucune colonne pour le champ obligatoire rue',
        'Aucune colonne pour le champ obligatoire codePostal',
        'Aucune colonne pour le champ obligatoire ville',
        'Aucune colonne pour nomClient ni pour raisonSociale : l’un des deux est obligatoire',
      ]);
    });

    it('accepte la raison sociale à la place du nom', () => {
      expect(() =>
        etablirCorrespondance(['societe', 'telephone', 'rue', 'cp', 'ville']),
      ).not.toThrow();
    });

    it('refuse un champ obligatoire retiré par la correspondance envoyée', () => {
      expect(messagesDe(() => etablirCorrespondance(OBLIGATOIRES, { ville: null }))).toEqual([
        'Aucune colonne pour le champ obligatoire ville',
      ]);
    });
  });
});
