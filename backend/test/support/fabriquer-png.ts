import { crc32, deflateSync } from 'node:zlib';

/*
 * PNG minimal fabriqué à la volée pour les tests de la signature (US33) : aucun fichier binaire
 * n'est versionné. L'image est en niveaux de gris sur 8 bits, entièrement blanche.
 */

export interface OptionsPng {
  largeur?: number;
  hauteur?: number;
  /** Taille exacte voulue en octets, atteinte par un bloc privé de bourrage. */
  taille?: number;
}

const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Longueur, type et CRC d'un bloc.
const ENTOURAGE_D_UN_BLOC = 12;
// Bloc auxiliaire, privé et copiable (minuscules et majuscule imposées par la norme PNG) :
// un lecteur d'image l'ignore.
const TYPE_BOURRAGE = 'teSt';

export function fabriquerPng({ largeur = 600, hauteur = 200, taille }: OptionsPng = {}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr.writeUInt8(8, 8); // profondeur : 8 bits
  ihdr.writeUInt8(0, 9); // niveaux de gris
  // Octets 10 à 12 à zéro : compression, filtre et entrelacement par défaut.
  // Chaque ligne commence par l'octet de filtre 0, suivi d'un octet par pixel.
  const pixels = Buffer.alloc((largeur + 1) * hauteur, 0xff);
  for (let ligne = 0; ligne < hauteur; ligne += 1) {
    pixels[ligne * (largeur + 1)] = 0;
  }
  const blocs = [bloc('IHDR', ihdr), bloc('IDAT', deflateSync(pixels))];
  const sansBourrage = SIGNATURE_PNG.length + longueur(blocs) + ENTOURAGE_D_UN_BLOC;
  if (taille !== undefined) {
    const bourrage = taille - sansBourrage - ENTOURAGE_D_UN_BLOC;
    if (bourrage < 0) {
      throw new Error(`PNG de ${largeur}×${hauteur} trop grand pour tenir en ${taille} octets.`);
    }
    blocs.push(bloc(TYPE_BOURRAGE, Buffer.alloc(bourrage)));
  }
  return Buffer.concat([SIGNATURE_PNG, ...blocs, bloc('IEND', Buffer.alloc(0))]);
}

export function enDataUrl(octets: Buffer, prefixe = 'data:image/png;base64,'): string {
  return prefixe + octets.toString('base64');
}

function bloc(type: string, donnees: Buffer): Buffer {
  const longueurEtType = Buffer.alloc(8);
  longueurEtType.writeUInt32BE(donnees.length, 0);
  longueurEtType.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([longueurEtType.subarray(4), donnees])), 0);
  return Buffer.concat([longueurEtType, donnees, crc]);
}

function longueur(blocs: Buffer[]): number {
  return blocs.reduce((total, morceau) => total + morceau.length, 0);
}
