import { ecrireCsv } from './ecrire-csv.js';

const BOM = '﻿';

/** Lignes du fichier, BOM et dernière fin de ligne retirés. */
function lignesDe(csv: string): string[] {
  return csv.slice(BOM.length).split('\r\n').slice(0, -1);
}

describe('ecrireCsv', () => {
  it('écrit le BOM, l’en-tête puis les lignes séparées par « ; » et terminées par CRLF', () => {
    const csv = ecrireCsv(['id', 'nom'], [[8, 'Dupont']]);

    expect(csv).toBe(`${BOM}id;nom\r\n8;Dupont\r\n`);
  });

  it('écrit un fichier sans ligne de données : l’en-tête seul', () => {
    expect(ecrireCsv(['id', 'nom'], [])).toBe(`${BOM}id;nom\r\n`);
  });

  it('conserve les accents tels quels (UTF-8)', () => {
    const csv = ecrireCsv(['ville'], [['Saint-André Écoles']]);

    expect(lignesDe(csv)[1]).toBe('Saint-André Écoles');
  });

  it('écrit null comme une cellule vide', () => {
    const csv = ecrireCsv(['a', 'b', 'c'], [['x', null, 'z']]);

    expect(lignesDe(csv)[1]).toBe('x;;z');
  });

  it.each([
    ['un point-virgule', 'Bât. B; 2e étage', '"Bât. B; 2e étage"'],
    ['des guillemets, doublés', 'Hôtel "Les Lilas"', '"Hôtel ""Les Lilas"""'],
    ['un saut de ligne', 'ligne 1\nligne 2', '"ligne 1\nligne 2"'],
    ['un retour chariot et un saut de ligne', 'ligne 1\r\nligne 2', '"ligne 1\r\nligne 2"'],
  ])('entoure de guillemets une cellule qui contient %s', (_cas, cellule, attendu) => {
    const csv = ecrireCsv(['valeur'], [[cellule]]);

    expect(csv).toBe(`${BOM}valeur\r\n${attendu}\r\n`);
  });

  it('n’entoure pas une cellule ordinaire, même avec une virgule', () => {
    const csv = ecrireCsv(['rue'], [['12, rue des Manguiers']]);

    expect(lignesDe(csv)[1]).toBe('12, rue des Manguiers');
  });

  describe('neutralisation des formules (RG26)', () => {
    it.each([
      ['=', '=HYPERLINK("http://exemple.re")', `"'=HYPERLINK(""http://exemple.re"")"`],
      ['+', '+33 6 92', "'+33 6 92"],
      ['-', '-12', "'-12"],
      ['@', '@SUM(A1:A2)', "'@SUM(A1:A2)"],
      ['une tabulation', '\tcommande', "'\tcommande"],
      ['un retour chariot', '\rcommande', `"'\rcommande"`],
    ])('précède d’une apostrophe un texte qui commence par %s', (_debut, cellule, attendu) => {
      const csv = ecrireCsv(['valeur'], [[cellule]]);

      expect(csv).toBe(`${BOM}valeur\r\n${attendu}\r\n`);
    });

    it('ne préfixe jamais un nombre, même négatif', () => {
      const csv = ecrireCsv(['nombre', 'texte'], [[-12, '-12']]);

      expect(lignesDe(csv)[1]).toBe("-12;'-12");
    });

    it('ne préfixe pas un texte qui contient ces caractères ailleurs qu’au début', () => {
      const csv = ecrireCsv(['valeur'], [['0692123456'], ['Dupont-Hoarau'], ['a=b']]);

      expect(lignesDe(csv).slice(1)).toEqual(['0692123456', 'Dupont-Hoarau', 'a=b']);
    });

    it('ne préfixe pas une cellule vide', () => {
      const csv = ecrireCsv(['valeur'], [['']]);

      expect(lignesDe(csv)[1]).toBe('');
    });
  });
});
