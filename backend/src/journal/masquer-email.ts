import type { EmailMasque } from './journal.types.js';

const FORMAT_EMAIL = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/;
const LONGUEUR_EMAIL_MAXIMUM = 255;
const MASQUE_ENTREE_INVALIDE = '***' as EmailMasque;

/**
 * E-mail saisi lors d'une connexion échouée, réduit à sa première lettre et à son domaine :
 * « karim.benali@exemple.fr » devient « k***@exemple.fr » (RGPD, modèle de données 8.2).
 *
 * La longueur de la partie locale n'est pas révélée. Une saisie qui n'est pas un e-mail donne
 * « *** » au lieu d'une erreur : la tentative de connexion doit quand même être journalisée.
 */
export function masquerEmail(saisie: string): EmailMasque {
  const morceaux = saisie.length > LONGUEUR_EMAIL_MAXIMUM ? null : FORMAT_EMAIL.exec(saisie.trim());
  if (morceaux === null) {
    return MASQUE_ENTREE_INVALIDE;
  }
  const [, partieLocale, domaine] = morceaux;
  // Array.from découpe par caractère : une lettre accentuée ou un emoji n'est pas coupé en deux.
  const premierCaractere = Array.from(partieLocale)[0];
  return `${premierCaractere}***@${domaine.toLowerCase()}` as EmailMasque;
}
