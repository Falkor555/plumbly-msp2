import { describe, expect, it } from 'vitest';
import { lienItineraire, lienTelephone } from './liens';

describe('lien téléphone', () => {
  it('retire les espaces et la ponctuation du numéro', () => {
    expect(lienTelephone('0692 12-34.56')).toBe('tel:0692123456');
  });

  it('garde le « + » des numéros internationaux', () => {
    expect(lienTelephone('+262 692 12 34 56')).toBe('tel:+262692123456');
  });
});

describe('lien itinéraire', () => {
  it("vise l'adresse complète, encodée, dans Google Maps", () => {
    const lien = lienItineraire({
      rue: '12 rue de Paris',
      codePostal: '97438',
      ville: 'Sainte-Marie',
    });

    expect(lien).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12%20rue%20de%20Paris%2C%2097438%20Sainte-Marie',
    );
  });

  it("encode les caractères qui casseraient l'URL", () => {
    const lien = lienItineraire({
      rue: "3 chemin de l'Étang & Co #2",
      codePostal: '97400',
      ville: 'Saint-Denis',
    });

    const url = new URL(lien);
    expect(lien).toContain('%C3%89tang%20%26%20Co%20%232');
    expect(url.hash).toBe('');
    expect([...url.searchParams.keys()]).toEqual(['api', 'destination']);
    expect(url.searchParams.get('destination')).toBe(
      "3 chemin de l'Étang & Co #2, 97400 Saint-Denis",
    );
  });
});
