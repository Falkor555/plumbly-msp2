import type { LigneCsv, SeparateurCsv } from '../api/types';
import { refuser } from './validationSimulee';

/*
 * Écriture et lecture des fichiers CSV du mode simulé, recopiées de backend/src/commun/csv/
 * (ecrire-csv.ts, lire-csv.ts) : l'export simulé s'ouvre dans un tableur comme le vrai, et l'import
 * simulé découpe un fichier comme l'API, numéros de ligne et messages d'erreur compris.
 */

/** Sans BOM, Excel lit le fichier en Windows-1252 et les accents sont abîmés. */
export const BOM = '\uFEFF';

// ---------- Écriture (export, RG26) ----------

/** Cellule d'un export : un nombre n'est jamais neutralisé, null donne une cellule vide. */
export type CelluleCsv = string | number | null;

const SEPARATEUR_EXPORT = ';';
const FIN_DE_LIGNE = '\r\n';
/*
 * Premiers caractères qui font d'une cellule une formule dans un tableur (OWASP « CSV
 * Injection ») : l'apostrophe devant force le texte ; l'import la retire.
 */
const DEBUTS_DE_FORMULE = ['=', '+', '-', '@', '\t', '\r'];
const APOSTROPHE = "'";
// Une cellule qui contient l'un de ces caractères est entourée de guillemets (RFC 4180).
const A_ENTOURER = /[;"\r\n]/;

/** Les lignes du fichier, chacune terminée par CRLF ; la réponse de l'export pose le BOM. */
export function ecrireCsv(enTetes: readonly string[], lignes: readonly CelluleCsv[][]): string {
  return [enTetes, ...lignes]
    .map((cellules) => cellules.map(ecrireCellule).join(SEPARATEUR_EXPORT) + FIN_DE_LIGNE)
    .join('');
}

function ecrireCellule(cellule: CelluleCsv): string {
  if (cellule === null) return '';
  if (typeof cellule === 'number') return String(cellule);
  return entourerSiNecessaire(neutraliserFormule(cellule));
}

function neutraliserFormule(texte: string): string {
  return DEBUTS_DE_FORMULE.some((debut) => texte.startsWith(debut)) ? APOSTROPHE + texte : texte;
}

function entourerSiNecessaire(texte: string): string {
  return A_ENTOURER.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}

// ---------- Lecture (import, US31) ----------

export interface CsvLu {
  separateur: SeparateurCsv;
  enTetes: string[];
  /** Lignes de données ; numero est celui de la première ligne physique (l'en-tête est la 1). */
  lignes: LigneCsv[];
}

const GUILLEMET = '"';

/**
 * Séparateur « ; » ou « , » imposé ou détecté sur la ligne d'en-têtes, guillemets RFC 4180
 * (séparateur, guillemets doublés et retours à la ligne dans un champ), fins de ligne CRLF, LF ou
 * CR seul, BOM retiré, lignes vides (ou faites de séparateurs seuls) ignorées.
 */
export function lireCsv(texte: string, separateurImpose?: SeparateurCsv): CsvLu {
  const contenu = texte.startsWith(BOM) ? texte.slice(BOM.length) : texte;
  const separateur = separateurImpose ?? detecterSeparateur(contenu);
  const [enTetes, ...lignes] = decouper(contenu, separateur).filter((ligne) => !estVide(ligne));
  if (enTetes === undefined) throw refuser(['Le fichier est vide']);
  return { separateur, enTetes: enTetes.cellules, lignes };
}

/** Le séparateur le plus fréquent hors guillemets sur la ligne d'en-têtes ; « ; » à égalité. */
function detecterSeparateur(contenu: string): SeparateurCsv {
  const nombre = { ';': 0, ',': 0 };
  let entreGuillemets = false;
  let ligneCommencee = false;
  // Comme au découpage, seul un guillemet en début de cellule ouvre un champ entre guillemets.
  let debutDeCellule = true;
  for (const caractere of contenu) {
    const finDeLigne = caractere === '\n' || caractere === '\r';
    if (caractere === GUILLEMET && (entreGuillemets || debutDeCellule)) {
      entreGuillemets = !entreGuillemets;
    } else if (!entreGuillemets && finDeLigne && ligneCommencee) {
      // Fin de la ligne d'en-têtes ; les lignes vides qui la précèdent sont sautées.
      break;
    } else if (!entreGuillemets && (caractere === ';' || caractere === ',')) {
      nombre[caractere] += 1;
    }
    debutDeCellule = !entreGuillemets && [';', ',', '\n', '\r'].includes(caractere);
    ligneCommencee ||= caractere.trim() !== '';
  }
  return nombre[','] > nombre[';'] ? ',' : ';';
}

/** État du découpage : la ligne physique courante et l'enregistrement en construction. */
interface Decoupage {
  separateur: SeparateurCsv;
  enregistrements: LigneCsv[];
  ligneCourante: number;
  debutDeLEnregistrement: number;
  cellules: string[];
  cellule: string;
  /** Faux tant que la cellule n'a reçu aucun caractère : seul un guillemet à ce moment l'ouvre. */
  celluleCommencee: boolean;
  entreGuillemets: boolean;
}

function decouper(contenu: string, separateur: SeparateurCsv): LigneCsv[] {
  const etat: Decoupage = {
    separateur,
    enregistrements: [],
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
    rang += etat.entreGuillemets
      ? lireEntreGuillemets(etat, caractere, suivant)
      : lireHorsGuillemets(etat, caractere, suivant);
  }
  if (etat.entreGuillemets) {
    throw refuser([
      `Le fichier contient des guillemets non fermés (ligne ${etat.debutDeLEnregistrement})`,
    ]);
  }
  etat.enregistrements.push(terminerEnregistrement(etat));
  return etat.enregistrements;
}

/** Un caractère hors guillemets ; renvoie le nombre de caractères supplémentaires consommés. */
function lireHorsGuillemets(etat: Decoupage, caractere: string, suivant?: string): number {
  if (caractere === GUILLEMET && !etat.celluleCommencee) {
    etat.entreGuillemets = true;
    etat.celluleCommencee = true;
  } else if (caractere === etat.separateur) {
    etat.cellules.push(etat.cellule);
    etat.cellule = '';
    etat.celluleCommencee = false;
  } else if (caractere === '\r' || caractere === '\n') {
    etat.enregistrements.push(terminerEnregistrement(etat));
    etat.ligneCourante += 1;
    etat.debutDeLEnregistrement = etat.ligneCourante;
    // CRLF est une seule fin de ligne.
    return caractere === '\r' && suivant === '\n' ? 1 : 0;
  } else {
    // Un guillemet au milieu d'une cellule (« 3" ») est un caractère comme un autre.
    etat.cellule += caractere;
    etat.celluleCommencee = true;
  }
  return 0;
}

/** Un caractère entre guillemets ; renvoie le nombre de caractères supplémentaires consommés. */
function lireEntreGuillemets(etat: Decoupage, caractere: string, suivant?: string): number {
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
