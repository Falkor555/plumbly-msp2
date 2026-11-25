import { BadRequestException } from '@nestjs/common';
import { ecrireCsv } from './ecrire-csv.js';
import { lireCsv } from './lire-csv.js';

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

describe('lireCsv', () => {
  describe('séparateur', () => {
    it('détecte « ; »', () => {
      const csv = lireCsv('nom;ville\nDupont;Saint-Denis');

      expect(csv).toEqual({
        separateur: ';',
        enTetes: ['nom', 'ville'],
        lignes: [{ numero: 2, cellules: ['Dupont', 'Saint-Denis'] }],
      });
    });

    it('détecte « , »', () => {
      const csv = lireCsv('nom,ville\nDupont,Saint-Denis');

      expect(csv.separateur).toBe(',');
      expect(csv.lignes[0].cellules).toEqual(['Dupont', 'Saint-Denis']);
    });

    it('choisit « ; » en cas d’égalité', () => {
      expect(lireCsv('nom;prenom,ville\nDupont;Marie,Saint-Denis').separateur).toBe(';');
    });

    it('compte les séparateurs de la seule ligne d’en-têtes, hors guillemets', () => {
      const csv = lireCsv('"nom;complet",ville\n"a;b;c;d",x');

      expect(csv.separateur).toBe(',');
      expect(csv.enTetes).toEqual(['nom;complet', 'ville']);
    });

    it('ne compte pas les lignes de données quand l’en-tête n’a qu’une colonne', () => {
      expect(lireCsv('nom\na,b,c').separateur).toBe(';');
    });

    it('applique le séparateur imposé, même s’il est minoritaire', () => {
      const csv = lireCsv('nom;prenom,ville\nDupont;Marie,Saint-Denis', ',');

      expect(csv.separateur).toBe(',');
      expect(csv.enTetes).toEqual(['nom;prenom', 'ville']);
    });
  });

  describe('guillemets (RFC 4180)', () => {
    it('lit un champ qui contient le séparateur', () => {
      expect(lireCsv('rue;ville\n"Bât. B; 2e étage";Saint-Denis').lignes[0].cellules).toEqual([
        'Bât. B; 2e étage',
        'Saint-Denis',
      ]);
    });

    it('lit des guillemets doublés', () => {
      expect(lireCsv('nom\n"Hôtel ""Les Lilas"""').lignes[0].cellules).toEqual([
        'Hôtel "Les Lilas"',
      ]);
    });

    it('lit un champ sur deux lignes, numéroté par sa première ligne, et numérote bien la suite', () => {
      const csv = lireCsv('nom;acces\nDupont;"Code 4521\r\n3e étage"\r\nPayet;Portail\nHoarau;');

      expect(csv.lignes).toEqual([
        { numero: 2, cellules: ['Dupont', 'Code 4521\r\n3e étage'] },
        { numero: 4, cellules: ['Payet', 'Portail'] },
        { numero: 5, cellules: ['Hoarau', ''] },
      ]);
    });

    it('garde un guillemet placé au milieu d’une cellule, sans avaler les lignes suivantes', () => {
      const csv = lireCsv(
        'nom;rue\nHoarau;12 rue A 3"\nPayet;1 rue C\nGrondin;Bât 2"\nRivière;5 rue D',
      );

      expect(csv.lignes).toEqual([
        { numero: 2, cellules: ['Hoarau', '12 rue A 3"'] },
        { numero: 3, cellules: ['Payet', '1 rue C'] },
        { numero: 4, cellules: ['Grondin', 'Bât 2"'] },
        { numero: 5, cellules: ['Rivière', '5 rue D'] },
      ]);
    });

    it('n’échoue pas sur un seul guillemet au milieu d’une cellule', () => {
      expect(lireCsv('nom;rue\nA;3"\nB;x').lignes).toHaveLength(2);
    });

    it('garde tels quels les caractères qui suivent un champ entre guillemets', () => {
      expect(lireCsv('nom;rue\n"Dupont" fils;"1 rue"bis').lignes[0].cellules).toEqual([
        'Dupont fils',
        '1 ruebis',
      ]);
    });

    it('ne compte pas un guillemet au milieu d’un en-tête pour détecter le séparateur', () => {
      // Pris pour un début de guillemets, le " cacherait les trois « ; » qui suivent.
      const csv = lireCsv('nom,taille 3";poids;ville;commune\nA,1;2;3;4');

      expect(csv.separateur).toBe(';');
      expect(csv.enTetes).toEqual(['nom,taille 3"', 'poids', 'ville', 'commune']);
    });

    it('refuse des guillemets non fermés en donnant la ligne où ils s’ouvrent', () => {
      expect(
        messagesDe(() => lireCsv('nom;ville\nDupont;Saint-Denis\n"Payet;Saint-Pierre')),
      ).toEqual(['Le fichier contient des guillemets non fermés (ligne 3)']);
    });

    it('ne cite jamais le contenu du fichier dans son message', () => {
      const messages = messagesDe(() => lireCsv('nom\n"Grondin Hélène 0692123456'));

      expect(JSON.stringify(messages)).not.toMatch(/Grondin|0692123456/);
    });
  });

  describe('lignes', () => {
    it('retire le BOM de début', () => {
      expect(lireCsv('\uFEFFnom;ville\nDupont;Saint-Denis').enTetes).toEqual(['nom', 'ville']);
    });

    it('lit des fins de ligne LF seules, CRLF et CR seules', () => {
      const lignes = (texte: string) => lireCsv(texte).lignes;

      expect(lignes('nom\na\nb')).toEqual(lignes('nom\r\na\r\nb'));
      expect(lignes('nom\ra\rb')).toEqual([
        { numero: 2, cellules: ['a'] },
        { numero: 3, cellules: ['b'] },
      ]);
    });

    it('ignore les lignes vides et les lignes de cellules vides, sans changer les numéros', () => {
      const csv = lireCsv('nom;ville\n\nDupont;Saint-Denis\n;\n  ;  \r\nPayet;Saint-Pierre\n\n');

      expect(csv.lignes).toEqual([
        { numero: 3, cellules: ['Dupont', 'Saint-Denis'] },
        { numero: 6, cellules: ['Payet', 'Saint-Pierre'] },
      ]);
    });

    it('garde une ligne qui n’a pas le nombre de colonnes de l’en-tête (rejetée plus loin)', () => {
      expect(lireCsv('nom;ville\nDupont').lignes).toEqual([{ numero: 2, cellules: ['Dupont'] }]);
    });

    it('lit un en-tête sans ligne de données', () => {
      expect(lireCsv('nom;ville\r\n')).toEqual({
        separateur: ';',
        enTetes: ['nom', 'ville'],
        lignes: [],
      });
    });

    it.each([
      ['un texte vide', ''],
      ['le BOM seul', '\uFEFF'],
      ['des lignes vides', '\r\n\n  \n'],
    ])('refuse %s : le fichier est vide', (_cas, texte) => {
      expect(messagesDe(() => lireCsv(texte))).toEqual(['Le fichier est vide']);
    });

    it('garde les cellules telles quelles : espaces et apostrophes compris', () => {
      expect(lireCsv("nom;prenom\n  'Dupont ;'=1").lignes[0].cellules).toEqual([
        "  'Dupont ",
        "'=1",
      ]);
    });
  });

  it('aller-retour : lireCsv(ecrireCsv(x)) redonne x', () => {
    const enTetes = ['nom', 'complement', 'infos_acces', 'ville'];
    const lignes = [
      ['Hoarau', 'Bât. B; 2e étage', 'Code "4521"\r\nau fond', 'Saint-André'],
      ['Payet', '', 'Portail\nbleu', 'L’Étang-Salé'],
      ['Grondin', 'a,b', '', 'Saint-Pierre'],
    ];

    const csv = lireCsv(ecrireCsv(enTetes, lignes));

    expect(csv.separateur).toBe(';');
    expect(csv.enTetes).toEqual(enTetes);
    expect(csv.lignes.map(({ cellules }) => cellules)).toEqual(lignes);
    expect(csv.lignes.map(({ numero }) => numero)).toEqual([2, 4, 6]);
  });
});
