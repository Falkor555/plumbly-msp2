/**
 * Contrastes de couleurs selon WCAG 2.1 (RGAA 4.1.2, critère 3.2) : un texte de taille normale
 * doit atteindre un rapport de 4,5:1 avec son arrière-plan.
 */

export type TexteLisible = 'noir' | 'blanc';

/** Seuil WCAG 2.1 AA (RGAA 3.2) pour un texte de taille normale. */
export const CONTRASTE_MINIMAL_TEXTE = 4.5;

const FORMAT_HEXADECIMAL = /^#[0-9a-f]{6}$/i;
const NOIR = '#000000';
const BLANC = '#ffffff';

/** Composantes rouge, vert, bleu entre 0 et 1 d'une couleur « #RRGGBB ». */
function composantes(couleur: string): [number, number, number] {
  if (!FORMAT_HEXADECIMAL.test(couleur)) {
    throw new RangeError(`Couleur « ${couleur} » invalide : format #RRGGBB attendu.`);
  }
  const canal = (debut: number): number => parseInt(couleur.slice(debut, debut + 2), 16) / 255;
  return [canal(1), canal(3), canal(5)];
}

/*
 * Retire la correction gamma de sRGB. WCAG 2.x écrit le seuil 0,03928 (reprise d'un ancien
 * brouillon de sRGB) ; la norme dit 0,04045. Aucune valeur sur 8 bits ne tombe entre les deux :
 * le résultat est identique.
 */
function lineariser(composante: number): number {
  return composante <= 0.04045 ? composante / 12.92 : ((composante + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative WCAG : 0 pour le noir, 1 pour le blanc. */
export function luminanceRelative(couleur: string): number {
  const [rouge, vert, bleu] = composantes(couleur).map(lineariser);
  return 0.2126 * rouge + 0.7152 * vert + 0.0722 * bleu;
}

/** Rapport de contraste WCAG entre deux couleurs, de 1 (identiques) à 21 (noir et blanc). */
export function rapportDeContraste(premiere: string, seconde: string): number {
  const luminances = [luminanceRelative(premiere), luminanceRelative(seconde)];
  return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
}

/**
 * Couleur de texte la plus lisible sur un fond choisi librement (couleur de planning d'un
 * technicien) : celle des deux qui contraste le plus. À égalité, le noir l'emporte.
 */
export function texteLisibleSur(fond: string): TexteLisible {
  return rapportDeContraste(NOIR, fond) >= rapportDeContraste(BLANC, fond) ? 'noir' : 'blanc';
}
