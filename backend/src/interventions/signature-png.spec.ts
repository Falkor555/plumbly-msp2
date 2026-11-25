import { enDataUrl, fabriquerPng } from '../../test/support/fabriquer-png.js';
import {
  ImagePngRefusee,
  lireImagePng,
  MESSAGE_DIMENSIONS,
  MESSAGE_IMAGE_TROP_LOURDE,
  MESSAGE_PNG_INVALIDE,
  versDataUrlPng,
} from './signature-png.js';

const PREFIXE = 'data:image/png;base64,';

function refus(dataUrl: string): string {
  try {
    lireImagePng(dataUrl);
  } catch (erreur) {
    if (erreur instanceof ImagePngRefusee) {
      return erreur.message;
    }
    throw erreur;
  }
  throw new Error('L’image a été acceptée.');
}

/** Copie modifiable d'un PNG valide de 600 × 200. */
function pngModifie(modifier: (octets: Buffer) => Buffer | void): string {
  const octets = Buffer.from(fabriquerPng());
  return enDataUrl(modifier(octets) ?? octets);
}

describe('lireImagePng (RG35)', () => {
  it('accepte un PNG valide et renvoie ses octets', () => {
    const png = fabriquerPng({ largeur: 600, hauteur: 200 });

    const image = lireImagePng(enDataUrl(png));

    expect(Buffer.compare(image, png)).toBe(0);
  });

  it('redonne à l’identique la data URL reçue', () => {
    const dataUrl = enDataUrl(fabriquerPng());

    expect(versDataUrlPng(lireImagePng(dataUrl))).toBe(dataUrl);
  });

  describe('format de la data URL', () => {
    it.each([
      ['sans préfixe', fabriquerPng().toString('base64')],
      ['préfixe JPEG', enDataUrl(fabriquerPng(), 'data:image/jpeg;base64,')],
      ['préfixe en majuscules', enDataUrl(fabriquerPng(), 'DATA:IMAGE/PNG;BASE64,')],
      ['SVG', `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`],
      ['SVG en texte', 'data:image/svg+xml,<svg onload="alert(1)"/>'],
      ['vide', ''],
    ])('refuse une image %s', (_cas, dataUrl) => {
      expect(refus(dataUrl)).toBe(MESSAGE_PNG_INVALIDE);
    });
  });

  describe('base64 strict', () => {
    const base64 = fabriquerPng().toString('base64');

    it.each([
      ['vide', ''],
      ['avec un espace', `${base64.slice(0, 8)} ${base64.slice(8)}`],
      ['avec un saut de ligne', `${base64.slice(0, 8)}\n${base64.slice(8)}`],
      ['en base64url', base64.replaceAll('+', '-').replaceAll('/', '_') + '-_'],
      // 8 octets s'encodent en « iVBORw0KGgo= » : le « = » final est obligatoire.
      ['sans remplissage', 'iVBORw0KGgo'],
      ['avec un caractère hors alphabet', `${base64.slice(0, -4)}*AAA`],
      ['avec des bits de remplissage non nuls', 'iVBORw0KGgp='],
    ])('refuse un texte %s', (_cas, texte) => {
      expect(refus(PREFIXE + texte)).toBe(MESSAGE_PNG_INVALIDE);
    });

    it('refuse un texte quelconque encodé en base64', () => {
      const texte = Buffer.from('Ceci n’est pas une image.').toString('base64');

      expect(refus(PREFIXE + texte)).toBe(MESSAGE_PNG_INVALIDE);
    });
  });

  describe('taille décodée', () => {
    it('accepte exactement 49 152 octets', () => {
      const png = fabriquerPng({ taille: 49_152 });

      expect(lireImagePng(enDataUrl(png))).toHaveLength(49_152);
    });

    it('refuse 49 153 octets', () => {
      const png = fabriquerPng({ taille: 49_153 });

      expect(refus(enDataUrl(png))).toBe(MESSAGE_IMAGE_TROP_LOURDE);
    });
  });

  describe('structure du PNG', () => {
    it('refuse un PNG tronqué', () => {
      const dataUrl = pngModifie((octets) => octets.subarray(0, 30));

      expect(refus(dataUrl)).toBe(MESSAGE_PNG_INVALIDE);
    });

    it('refuse un en-tête qui n’est pas celui d’un PNG', () => {
      const dataUrl = pngModifie((octets) => {
        octets[1] = 0x51;
      });

      expect(refus(dataUrl)).toBe(MESSAGE_PNG_INVALIDE);
    });

    it('refuse un JPEG envoyé avec le préfixe PNG', () => {
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);

      expect(refus(enDataUrl(jpeg))).toBe(MESSAGE_PNG_INVALIDE);
    });

    it('refuse un premier bloc qui n’est pas IHDR', () => {
      const dataUrl = pngModifie((octets) => {
        octets.write('IDAT', 12, 'latin1');
      });

      expect(refus(dataUrl)).toBe(MESSAGE_PNG_INVALIDE);
    });

    it('refuse un bloc IHDR qui n’a pas 13 octets', () => {
      const dataUrl = pngModifie((octets) => {
        octets.writeUInt32BE(12, 8);
      });

      expect(refus(dataUrl)).toBe(MESSAGE_PNG_INVALIDE);
    });

    it('refuse un PNG sans bloc IEND final', () => {
      const dataUrl = pngModifie((octets) => octets.subarray(0, octets.length - 12));

      expect(refus(dataUrl)).toBe(MESSAGE_PNG_INVALIDE);
    });

    it('refuse des octets ajoutés après le bloc IEND', () => {
      const dataUrl = pngModifie((octets) => Buffer.concat([octets, Buffer.from('<script>')]));

      expect(refus(dataUrl)).toBe(MESSAGE_PNG_INVALIDE);
    });
  });

  describe('dimensions', () => {
    it.each([
      [100, 50],
      [1200, 600],
    ])('accepte %i × %i px', (largeur, hauteur) => {
      expect(() => lireImagePng(enDataUrl(fabriquerPng({ largeur, hauteur })))).not.toThrow();
    });

    it.each([
      ['largeur de 99 px', 99, 200],
      ['largeur de 1 201 px', 1201, 200],
      ['hauteur de 49 px', 600, 49],
      ['hauteur de 601 px', 600, 601],
    ])('refuse une %s', (_cas, largeur, hauteur) => {
      expect(refus(enDataUrl(fabriquerPng({ largeur, hauteur })))).toBe(MESSAGE_DIMENSIONS);
    });
  });
});
