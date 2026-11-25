import { genererJetonRafraichissement, hacherJeton, lireSecretJwt } from './jetons.js';

describe('jeton de rafraîchissement', () => {
  it('est différent à chaque génération', () => {
    const jetons = new Set(Array.from({ length: 100 }, () => genererJetonRafraichissement().jeton));
    expect(jetons.size).toBe(100);
  });

  it('contient 256 bits aléatoires', () => {
    // 32 octets en base64url : 43 caractères.
    expect(genererJetonRafraichissement().jeton).toMatch(/^[\w-]{43}$/);
  });

  it('est stocké sous forme d’empreinte, jamais en clair', () => {
    const { jeton, hashJeton } = genererJetonRafraichissement();
    expect(hashJeton).not.toContain(jeton);
    expect(hashJeton).toBe(hacherJeton(jeton));
    expect(hashJeton).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('secret JWT', () => {
  const SECRET = 'x'.repeat(64);

  it('est lu dans l’environnement', () => {
    expect(lireSecretJwt({ JWT_SECRET: SECRET })).toBe(SECRET);
  });

  it.each([undefined, '', '   ', 'a-changer'])('est refusé s’il vaut %j', (valeur) => {
    expect(() => lireSecretJwt({ JWT_SECRET: valeur })).toThrow('JWT_SECRET manquant');
  });

  it('est refusé s’il fait moins de 32 caractères', () => {
    expect(() => lireSecretJwt({ JWT_SECRET: 'court' })).toThrow('JWT_SECRET trop court');
  });
});
