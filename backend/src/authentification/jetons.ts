import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '../generated/prisma/client.ts';

/*
 * Jetons de l'authentification (contrat d'API, section 2 ; ADR 0007).
 * - Jeton d'accès : JWT signé, court, vérifié sans la base de données.
 * - Jeton de rafraîchissement : valeur aléatoire, longue, stockée hachée pour être révocable.
 */

export const DUREE_JETON_ACCES_SECONDES = 15 * 60;
export const DUREE_JETON_RAFRAICHISSEMENT_MS = 7 * 24 * 60 * 60 * 1000;

const TAILLE_JETON_RAFRAICHISSEMENT_OCTETS = 32;
const LONGUEUR_SECRET_MINIMUM = 32;

/** Contenu du jeton d'accès : le strict nécessaire aux contrôles d'accès. */
export interface ContenuJetonAcces {
  sub: number;
  role: Role;
}

export interface NouveauJetonRafraichissement {
  /** Envoyé une seule fois au navigateur, dans le cookie ; jamais stocké. */
  jeton: string;
  /** Stocké en base à la place du jeton. */
  hashJeton: string;
}

/** 256 bits aléatoires : impossible à deviner, même à des milliards d'essais par seconde. */
export function genererJetonRafraichissement(): NouveauJetonRafraichissement {
  const jeton = randomBytes(TAILLE_JETON_RAFRAICHISSEMENT_OCTETS).toString('base64url');
  return { jeton, hashJeton: hacherJeton(jeton) };
}

/**
 * SHA-256 suffit ici, contrairement aux mots de passe : le jeton est aléatoire et très long,
 * un hachage lent comme argon2 n'apporterait rien et ralentirait chaque rafraîchissement.
 */
export function hacherJeton(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex');
}

/**
 * Secret de signature des jetons d'accès. L'API refuse de démarrer sans secret solide :
 * quiconque connaît ce secret peut fabriquer un jeton administrateur valide.
 */
export function lireSecretJwt(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET?.trim();
  if (secret === undefined || secret === '' || secret === 'a-changer') {
    throw new Error(
      'JWT_SECRET manquant : le définir dans .env (voir .env.example) avant de démarrer l’API.',
    );
  }
  if (secret.length < LONGUEUR_SECRET_MINIMUM) {
    throw new Error(
      `JWT_SECRET trop court : au moins ${LONGUEUR_SECRET_MINIMUM} caractères aléatoires.`,
    );
  }
  return secret;
}
