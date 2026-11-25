import { argon2Sync, randomBytes } from 'node:crypto';
import {
  erreursDePolitique,
  genererMotDePasseProvisoire,
  hacherMotDePasse,
  simulerVerification,
  verifierMotDePasse,
} from './mots-de-passe.js';

const MOT_DE_PASSE = 'Plombier#2026!';

/** Empreinte calculée exactement comme dans prisma/seed.ts. */
function empreinteCommeLeSeed(motDePasse: string): string {
  const sel = randomBytes(16);
  const empreinte = argon2Sync('argon2id', {
    message: motDePasse,
    nonce: sel,
    memory: 19_456,
    passes: 2,
    parallelism: 1,
    tagLength: 32,
  });
  return `$argon2id$v=19$m=19456,t=2,p=1$${sel.toString('base64url')}$${empreinte.toString('base64url')}`;
}

describe('hachage des mots de passe', () => {
  it('produit une empreinte argon2id au format PHC', async () => {
    const empreinte = await hacherMotDePasse(MOT_DE_PASSE);
    expect(empreinte).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[\w-]+\$[\w-]+$/);
  });

  it('utilise un sel différent à chaque fois', async () => {
    expect(await hacherMotDePasse(MOT_DE_PASSE)).not.toBe(await hacherMotDePasse(MOT_DE_PASSE));
  });

  it('ne contient jamais le mot de passe en clair', async () => {
    expect(await hacherMotDePasse(MOT_DE_PASSE)).not.toContain(MOT_DE_PASSE);
  });
});

describe('vérification des mots de passe', () => {
  it('accepte le bon mot de passe', async () => {
    const empreinte = await hacherMotDePasse(MOT_DE_PASSE);
    expect(await verifierMotDePasse(MOT_DE_PASSE, empreinte)).toBe(true);
  });

  it('refuse un mauvais mot de passe', async () => {
    const empreinte = await hacherMotDePasse(MOT_DE_PASSE);
    expect(await verifierMotDePasse('Plombier#2026?', empreinte)).toBe(false);
  });

  it('vérifie les empreintes créées par le seed', async () => {
    expect(await verifierMotDePasse(MOT_DE_PASSE, empreinteCommeLeSeed(MOT_DE_PASSE))).toBe(true);
  });

  it('refuse une empreinte mal formée sans lever d’erreur', async () => {
    expect(await verifierMotDePasse(MOT_DE_PASSE, 'pas-une-empreinte')).toBe(false);
  });

  it('refuse un mot de passe trop long sans le calculer', async () => {
    const empreinte = await hacherMotDePasse(MOT_DE_PASSE);
    expect(await verifierMotDePasse('A'.repeat(10_000), empreinte)).toBe(false);
  });

  it('simule une vérification sans erreur', async () => {
    await expect(simulerVerification(MOT_DE_PASSE)).resolves.toBeUndefined();
  });
});

describe('politique de mot de passe', () => {
  it('accepte un mot de passe conforme', () => {
    expect(erreursDePolitique(MOT_DE_PASSE, 'motDePasse')).toEqual([]);
  });

  it('liste toutes les règles non respectées', () => {
    expect(erreursDePolitique('abc', 'motDePasse')).toEqual([
      'motDePasse doit contenir au moins 12 caractères',
      'motDePasse doit contenir au moins une majuscule',
      'motDePasse doit contenir au moins un chiffre',
      'motDePasse doit contenir au moins un caractère spécial',
    ]);
  });

  it('refuse plus de 128 caractères', () => {
    expect(erreursDePolitique(`Aa1!${'x'.repeat(130)}`, 'motDePasse')).toEqual([
      'motDePasse ne peut pas dépasser 128 caractères',
    ]);
  });
});

describe('mot de passe provisoire', () => {
  it('respecte toujours la politique', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(erreursDePolitique(genererMotDePasseProvisoire(), 'provisoire')).toEqual([]);
    }
  });

  it('ne contient aucun caractère ambigu', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(genererMotDePasseProvisoire()).not.toMatch(/[0O1lI]/);
    }
  });

  it('est différent à chaque fois', () => {
    const generes = new Set(Array.from({ length: 100 }, genererMotDePasseProvisoire));
    expect(generes.size).toBe(100);
  });
});
