/*
 * Image de la signature du client (US33, RG35, ADR 0013), reçue en data URL PNG.
 *
 * Seule la structure du fichier est vérifiée : en-tête PNG, premier bloc IHDR, dimensions et
 * bloc IEND final. Les pixels ne sont pas décodés : vérifier qu'une signature n'est pas vide
 * demanderait une bibliothèque de décompression d'image, et c'est le front qui s'en charge
 * (limite assumée dans l'ADR). Ces contrôles suffisent à refuser un fichier d'un autre type
 * (JPEG, SVG, HTML) déguisé en PNG.
 */

export const PREFIXE_DATA_URL_PNG = 'data:image/png;base64,';
export const TAILLE_MAXIMUM_IMAGE = 49_152;
export const LARGEUR_MINIMUM = 100;
export const LARGEUR_MAXIMUM = 1200;
export const HAUTEUR_MINIMUM = 50;
export const HAUTEUR_MAXIMUM = 600;

export const MESSAGE_PNG_INVALIDE = 'La signature doit être une image PNG valide.';
export const MESSAGE_IMAGE_TROP_LOURDE = 'La signature dépasse 48 Ko.';
export const MESSAGE_DIMENSIONS =
  'La signature doit mesurer de 100 à 1 200 px de large et de 50 à 600 px de haut.';

const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Bloc IEND complet : longueur 0, type « IEND » et son CRC, toujours identiques.
const BLOC_IEND = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const LONGUEUR_IHDR = 13;
// Signature (8) + longueur et type du bloc IHDR (8) + données IHDR (13) + CRC (4).
const TAILLE_MINIMUM_PNG = SIGNATURE_PNG.length + 8 + LONGUEUR_IHDR + 4;
const BASE64_STANDARD = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Octets d'une image PNG déjà vérifiée. Le type marqué empêche d'enregistrer des octets reçus
 * tels quels : seul lireImagePng() fabrique une valeur de ce type.
 */
export type ImagePng = Buffer<ArrayBuffer> & { readonly __marque: 'ImagePng' };

/** Refus d'une image : le message est destiné à l'utilisateur, sans détail sur le contenu. */
export class ImagePngRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagePngRefusee';
  }
}

/** Octets du PNG contenu dans la data URL, ou ImagePngRefusee. */
export function lireImagePng(dataUrl: string): ImagePng {
  const octets = decoderBase64Strict(retirerPrefixe(dataUrl));
  if (octets.length > TAILLE_MAXIMUM_IMAGE) {
    throw new ImagePngRefusee(MESSAGE_IMAGE_TROP_LOURDE);
  }
  verifierStructure(octets);
  verifierDimensions(octets.readUInt32BE(16), octets.readUInt32BE(20));
  return octets as ImagePng;
}

/** Data URL renvoyée par GET /interventions/:id/signature. */
export function versDataUrlPng(octets: Uint8Array): string {
  return PREFIXE_DATA_URL_PNG + Buffer.from(octets).toString('base64');
}

function retirerPrefixe(dataUrl: string): string {
  if (!dataUrl.startsWith(PREFIXE_DATA_URL_PNG)) {
    throw new ImagePngRefusee(MESSAGE_PNG_INVALIDE);
  }
  return dataUrl.slice(PREFIXE_DATA_URL_PNG.length);
}

/**
 * Buffer.from(texte, 'base64') ignore les caractères inconnus, les espaces et le remplissage
 * manquant : il décoderait presque n'importe quoi. Le texte doit donc être en base64 standard,
 * et le réencodage doit redonner exactement le même texte (ce qui refuse aussi des bits de
 * remplissage non nuls). L'image renvoyée à la lecture est ainsi identique à celle reçue.
 */
function decoderBase64Strict(base64: string): Buffer<ArrayBuffer> {
  if (base64.length % 4 !== 0 || !BASE64_STANDARD.test(base64)) {
    throw new ImagePngRefusee(MESSAGE_PNG_INVALIDE);
  }
  const octets = Buffer.from(base64, 'base64');
  if (octets.toString('base64') !== base64) {
    throw new ImagePngRefusee(MESSAGE_PNG_INVALIDE);
  }
  return octets;
}

function verifierStructure(octets: Buffer): void {
  const structureValide =
    octets.length >= TAILLE_MINIMUM_PNG + BLOC_IEND.length &&
    octets.subarray(0, SIGNATURE_PNG.length).equals(SIGNATURE_PNG) &&
    octets.readUInt32BE(8) === LONGUEUR_IHDR &&
    octets.toString('latin1', 12, 16) === 'IHDR' &&
    octets.subarray(octets.length - BLOC_IEND.length).equals(BLOC_IEND);
  if (!structureValide) {
    throw new ImagePngRefusee(MESSAGE_PNG_INVALIDE);
  }
}

function verifierDimensions(largeur: number, hauteur: number): void {
  if (
    largeur < LARGEUR_MINIMUM ||
    largeur > LARGEUR_MAXIMUM ||
    hauteur < HAUTEUR_MINIMUM ||
    hauteur > HAUTEUR_MAXIMUM
  ) {
    throw new ImagePngRefusee(MESSAGE_DIMENSIONS);
  }
}
