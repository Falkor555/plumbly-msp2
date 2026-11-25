import { BadRequestException } from '@nestjs/common';

/*
 * Lecture d'un fichier CSV importé (US31, docs/import-export-csv.md section 4.3), sans dépendance
 * (ADR 0014). Le texte est une donnée : il est découpé, jamais interprété.
 *
 * - séparateur « ; » ou « , », détecté sur la ligne d'en-têtes hors guillemets (« ; » en cas
 *   d'égalité), ou imposé par l'appelant ;
 * - guillemets RFC 4180 : un champ entre guillemets peut contenir le séparateur, des guillemets
 *   doublés et des retours à la ligne ;
 * - fins de ligne CRLF, LF ou CR seul ; BOM de début retiré ;
 * - lignes vides (ou faites de cellules vides) ignorées.
 */

export type SeparateurCsv = ';' | ',';

export interface LigneCsv {
  /** Numéro de la première ligne physique de l'enregistrement : l'en-tête est la ligne 1. */
  numero: number;
  cellules: string[];
}

export interface CsvLu {
  separateur: SeparateurCsv;
  enTetes: string[];
  lignes: LigneCsv[];
}

const BOM = '\uFEFF';
const GUILLEMET = '"';

export function lireCsv(texte: string, separateurImpose?: SeparateurCsv): CsvLu {
  const contenu = texte.startsWith(BOM) ? texte.slice(BOM.length) : texte;
  const separateur = separateurImpose ?? detecterSeparateur(contenu);
  const enregistrements = decouper(contenu, separateur).filter((ligne) => !estVide(ligne));
  const [enTetes, ...lignes] = enregistrements;
  if (enTetes === undefined) {
    throw new BadRequestException(['Le fichier est vide']);
  }
  return { separateur, enTetes: enTetes.cellules, lignes };
}

/** Le séparateur le plus fréquent hors guillemets sur la ligne d'en-têtes ; « ; » à égalité. */
function detecterSeparateur(contenu: string): SeparateurCsv {
  let pointsVirgules = 0;
  let virgules = 0;
  let entreGuillemets = false;
  let ligneCommencee = false;
  // Comme au découpage, seul un guillemet en début de cellule ouvre un champ entre guillemets.
  let debutDeCellule = true;
  for (const caractere of contenu) {
    if (caractere === GUILLEMET && (entreGuillemets || debutDeCellule)) {
      entreGuillemets = !entreGuillemets;
    } else if (!entreGuillemets && (caractere === '\n' || caractere === '\r')) {
      // Fin de la ligne d'en-têtes ; les lignes vides qui la précèdent sont sautées.
      if (ligneCommencee) {
        break;
      }
    } else if (!entreGuillemets && caractere === ';') {
      pointsVirgules += 1;
    } else if (!entreGuillemets && caractere === ',') {
      virgules += 1;
    }
    debutDeCellule = !entreGuillemets && [';', ',', '\n', '\r'].includes(caractere);
    if (caractere.trim() !== '') {
      ligneCommencee = true;
    }
  }
  return virgules > pointsVirgules ? ',' : ';';
}

/** État du découpage : la ligne physique courante et l'enregistrement en construction. */
interface Decoupage {
  ligneCourante: number;
  debutDeLEnregistrement: number;
  cellules: string[];
  cellule: string;
  /** Faux tant que la cellule n'a reçu aucun caractère : seul un guillemet à ce moment l'ouvre. */
  celluleCommencee: boolean;
  entreGuillemets: boolean;
}

function decouper(contenu: string, separateur: SeparateurCsv): LigneCsv[] {
  const enregistrements: LigneCsv[] = [];
  const etat: Decoupage = {
    ligneCourante: 1,
    debutDeLEnregistrement: 1,
    cellules: [],
    cellule: '',
    celluleCommencee: false,
    entreGuillemets: false,
  };
  for (let rang = 0; rang < contenu.length; rang += 1) {
    const caractere = contenu[rang];
    const suivant = contenu[rang + 1];
    if (etat.entreGuillemets) {
      rang += lireEntreGuillemets(etat, caractere, suivant);
    } else if (caractere === GUILLEMET && !etat.celluleCommencee) {
      etat.entreGuillemets = true;
      etat.celluleCommencee = true;
    } else if (caractere === separateur) {
      etat.cellules.push(etat.cellule);
      etat.cellule = '';
      etat.celluleCommencee = false;
    } else if (caractere === '\r' || caractere === '\n') {
      enregistrements.push(terminerEnregistrement(etat));
      // CRLF est une seule fin de ligne.
      rang += caractere === '\r' && suivant === '\n' ? 1 : 0;
      etat.ligneCourante += 1;
      etat.debutDeLEnregistrement = etat.ligneCourante;
    } else {
      // Un guillemet au milieu d'une cellule (« 3" ») est un caractère comme un autre.
      etat.cellule += caractere;
      etat.celluleCommencee = true;
    }
  }
  if (etat.entreGuillemets) {
    throw new BadRequestException([
      `Le fichier contient des guillemets non fermés (ligne ${etat.debutDeLEnregistrement})`,
    ]);
  }
  enregistrements.push(terminerEnregistrement(etat));
  return enregistrements;
}

/** Un caractère entre guillemets ; renvoie le nombre de caractères supplémentaires consommés. */
function lireEntreGuillemets(
  etat: Decoupage,
  caractere: string,
  suivant: string | undefined,
): number {
  if (caractere === GUILLEMET && suivant === GUILLEMET) {
    etat.cellule += GUILLEMET;
    return 1;
  }
  if (caractere === GUILLEMET) {
    etat.entreGuillemets = false;
    return 0;
  }
  // Un retour à la ligne dans un champ est gardé tel quel ; la ligne physique avance quand même.
  if (caractere === '\n' || (caractere === '\r' && suivant !== '\n')) {
    etat.ligneCourante += 1;
  }
  etat.cellule += caractere;
  return 0;
}

function terminerEnregistrement(etat: Decoupage): LigneCsv {
  const enregistrement = {
    numero: etat.debutDeLEnregistrement,
    cellules: [...etat.cellules, etat.cellule],
  };
  etat.cellules = [];
  etat.cellule = '';
  etat.celluleCommencee = false;
  return enregistrement;
}

/** Ligne vide, ou faite de séparateurs seuls (« ;;; », laissée par certains tableurs). */
function estVide({ cellules }: LigneCsv): boolean {
  return cellules.every((cellule) => cellule.trim() === '');
}
