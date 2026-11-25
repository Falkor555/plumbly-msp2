/*
 * Écriture d'un fichier CSV pour Excel et LibreOffice (RG26, docs/api.md section 6.12), sans
 * dépendance (ADR 0014) : UTF-8 avec BOM, « ; », fins de ligne CRLF, guillemets RFC 4180.
 */

/** Cellule d'un export : un nombre n'est jamais neutralisé, null donne une cellule vide. */
export type CelluleCsv = string | number | null;

export const SEPARATEUR_CSV = ';';
const FIN_DE_LIGNE = '\r\n';
// Sans BOM, Excel lit le fichier en Windows-1252 et les accents sont abîmés.
const BOM = '\uFEFF';

/*
 * Premiers caractères qui font d'une cellule une formule dans un tableur (OWASP « CSV
 * Injection ») : « =HYPERLINK(…) » ouvrirait un lien, « @SUM(…) » calculerait. L'apostrophe
 * devant force le texte ; l'import la retire (docs/import-export-csv.md, section 4.3).
 */
const DEBUTS_DE_FORMULE = ['=', '+', '-', '@', '\t', '\r'];
const APOSTROPHE = "'";

// Une cellule qui contient l'un de ces caractères est entourée de guillemets (RFC 4180).
const A_ENTOURER = /[;"\r\n]/;

export function ecrireCsv(enTetes: readonly string[], lignes: readonly CelluleCsv[][]): string {
  const toutes = [enTetes, ...lignes].map((cellules) =>
    cellules.map(ecrireCellule).join(SEPARATEUR_CSV),
  );
  return BOM + toutes.map((ligne) => ligne + FIN_DE_LIGNE).join('');
}

function ecrireCellule(cellule: CelluleCsv): string {
  if (cellule === null) {
    return '';
  }
  if (typeof cellule === 'number') {
    return String(cellule);
  }
  return entourerSiNecessaire(neutraliserFormule(cellule));
}

function neutraliserFormule(texte: string): string {
  return DEBUTS_DE_FORMULE.some((debut) => texte.startsWith(debut)) ? APOSTROPHE + texte : texte;
}

function entourerSiNecessaire(texte: string): string {
  return A_ENTOURER.test(texte) ? `"${texte.replaceAll('"', '""')}"` : texte;
}
