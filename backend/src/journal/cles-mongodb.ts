/**
 * Refuse toute clé qui commence par « $ » ou contient un « . », à tous les niveaux.
 *
 * Pour MongoDB, « $ne » ou « $where » sont des opérateurs et « a.b » un chemin vers un
 * sous-document : une telle clé dans un document inséré, puis relu dans un filtre, changerait
 * le sens de la requête (injection NoSQL). Les clés du journal sont écrites par le code ; ce
 * contrôle garantit qu'une évolution maladroite ne pourra pas en laisser passer une.
 */
export function verifierClesSures(valeur: unknown, chemin = 'document'): void {
  if (Array.isArray(valeur)) {
    valeur.forEach((element, rang) => {
      verifierClesSures(element, `${chemin}[${rang}]`);
    });
    return;
  }
  if (typeof valeur !== 'object' || valeur === null || valeur instanceof Date) {
    return;
  }
  for (const [cle, sousValeur] of Object.entries(valeur)) {
    if (cle.startsWith('$') || cle.includes('.')) {
      throw new CleInterdite(`${chemin}.${cle}`);
    }
    verifierClesSures(sousValeur, `${chemin}.${cle}`);
  }
}

export class CleInterdite extends Error {
  constructor(readonly chemin: string) {
    super(`Clé interdite dans un document MongoDB : ${chemin}`);
    this.name = 'CleInterdite';
  }
}
