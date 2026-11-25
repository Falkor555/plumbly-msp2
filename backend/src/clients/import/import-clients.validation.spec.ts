import { BadRequestException } from '@nestjs/common';
import { lireDemandeAnalyse, lireDemandeImport } from './import-clients.validation.js';

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

const CONTENU = 'nom;telephone;rue;cp;ville\nDupont;0692123456;1 rue;97400;Saint-Denis';

describe('validation du corps des routes d’import', () => {
  describe('POST /clients/import/analysis', () => {
    it('lit le contenu seul', () => {
      expect(lireDemandeAnalyse({ contenu: CONTENU })).toEqual({ contenu: CONTENU });
    });

    it('lit le séparateur et la correspondance', () => {
      const demande = lireDemandeAnalyse({
        contenu: CONTENU,
        separateur: ',',
        correspondance: { Tel: 'telephone', remarque: null },
      });

      expect(demande).toEqual({
        contenu: CONTENU,
        separateur: ',',
        correspondance: { Tel: 'telephone', remarque: null },
      });
    });

    it('garde le contenu tel quel : ni espaces retirés ni BOM touché', () => {
      const contenu = `\uFEFF  ${CONTENU}\r\n  `;

      expect(lireDemandeAnalyse({ contenu }).contenu).toBe(contenu);
    });

    it('refuse strategieDoublons : l’analyse n’enregistre rien', () => {
      expect(
        messagesDe(() => lireDemandeAnalyse({ contenu: CONTENU, strategieDoublons: 'IGNORER' })),
      ).toEqual(['Le champ strategieDoublons n’est pas autorisé']);
    });

    it('refuse un champ inconnu', () => {
      expect(messagesDe(() => lireDemandeAnalyse({ contenu: CONTENU, estAdmin: true }))).toEqual([
        'Le champ estAdmin n’est pas autorisé',
      ]);
    });

    it.each([
      ['absent', {}, ['contenu est obligatoire']],
      ['null', { contenu: null }, ['contenu est obligatoire']],
      ['un nombre', { contenu: 12 }, ['contenu doit être un texte']],
    ])('refuse un contenu %s', (_cas, corps, messages) => {
      expect(messagesDe(() => lireDemandeAnalyse(corps))).toEqual(messages);
    });

    it('accepte exactement 1 000 000 caractères', () => {
      const contenu = 'a'.repeat(1_000_000);

      expect(lireDemandeAnalyse({ contenu }).contenu).toHaveLength(1_000_000);
    });

    it('refuse 1 000 001 caractères', () => {
      expect(messagesDe(() => lireDemandeAnalyse({ contenu: 'a'.repeat(1_000_001) }))).toEqual([
        'contenu ne doit pas dépasser 1 000 000 caractères',
      ]);
    });

    it('refuse un fichier qui n’est pas en UTF-8 (caractère de remplacement U+FFFD)', () => {
      // « Hélène » enregistré en Windows-1252 puis décodé en UTF-8 par le navigateur.
      const contenu = `${CONTENU}\nH\uFFFDl\uFFFDne;0692000000;1 rue;97400;Saint-Denis`;

      expect(messagesDe(() => lireDemandeAnalyse({ contenu }))).toEqual([
        'Enregistrez le fichier au format CSV UTF-8',
      ]);
    });

    it('refuse un caractère NUL dans le fichier', () => {
      expect(messagesDe(() => lireDemandeAnalyse({ contenu: `${CONTENU}\u0000` }))).toEqual([
        'contenu contient un caractère non autorisé',
      ]);
    });

    it('refuse un séparateur autre que « ; » ou « , »', () => {
      expect(messagesDe(() => lireDemandeAnalyse({ contenu: CONTENU, separateur: '\t' }))).toEqual([
        'separateur doit valoir ; ou ,',
      ]);
    });

    it.each([
      ['un tableau', ['telephone']],
      ['null', null],
      ['un texte', 'telephone'],
    ])('refuse une correspondance qui est %s', (_cas, correspondance) => {
      expect(messagesDe(() => lireDemandeAnalyse({ contenu: CONTENU, correspondance }))).toEqual([
        'correspondance doit être un objet',
      ]);
    });

    it('refuse une correspondance dont une valeur n’est ni un champ ni null', () => {
      expect(
        messagesDe(() => lireDemandeAnalyse({ contenu: CONTENU, correspondance: { Tel: 3 } })),
      ).toEqual(['correspondance doit associer chaque en-tête à un champ client ou à null']);
    });
  });

  describe('POST /clients/import', () => {
    it.each(['IGNORER', 'METTRE_A_JOUR'])('lit la stratégie %s', (strategieDoublons) => {
      expect(lireDemandeImport({ contenu: CONTENU, strategieDoublons })).toEqual({
        contenu: CONTENU,
        strategieDoublons,
      });
    });

    it.each([
      ['absente', {}],
      ['inconnue', { strategieDoublons: 'SIGNALER' }],
    ])('refuse une stratégie %s : le choix est explicite (RG28)', (_cas, champs) => {
      expect(messagesDe(() => lireDemandeImport({ contenu: CONTENU, ...champs }))).toEqual([
        'strategieDoublons doit valoir IGNORER ou METTRE_A_JOUR',
      ]);
    });

    it('rassemble les erreurs de tous les champs dans un seul 400', () => {
      expect(messagesDe(() => lireDemandeImport({ separateur: '|' }))).toEqual([
        'contenu est obligatoire',
        'separateur doit valoir ; ou ,',
        'strategieDoublons doit valoir IGNORER ou METTRE_A_JOUR',
      ]);
    });
  });
});
