/*
 * Téléphone d'un client ou d'un technicien : même règle que l'API (normaliserTelephone et
 * lireTelephone, backend/src/commun/validation.ts). La vérification signale une saisie refusée
 * avant l'envoi : c'est un confort, l'API reste seule juge.
 */

/** Au-delà, l'API refuse le numéro sans le nettoyer (normaliserTelephone). */
export const LONGUEUR_TELEPHONE_SAISI = 20;

const FORMAT_TELEPHONE = /^0\d{9}$/;

export const AIDE_TELEPHONE = '10 chiffres commençant par 0 ; espaces et points acceptés.';

export const MESSAGES_TELEPHONE = {
  obligatoire: 'Saisissez le téléphone : 10 chiffres commençant par 0, par exemple 0692 12 34 56.',
  invalide:
    'Le téléphone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés), par exemple 0692 12 34 56.',
} as const;

/** Numéro à 10 chiffres sans ses espaces ni ses points, ou null s'il n'est pas valide. */
export function normaliserTelephone(saisie: string): string | null {
  if (saisie.length > LONGUEUR_TELEPHONE_SAISI) return null;
  const chiffres = saisie.replace(/[ .]/g, '');
  return FORMAT_TELEPHONE.test(chiffres) ? chiffres : null;
}

/** Message à afficher sous le champ, ou undefined pour un numéro valide. */
export function verifierTelephone(saisie: string): string | undefined {
  if (saisie.trim() === '') return MESSAGES_TELEPHONE.obligatoire;
  return normaliserTelephone(saisie) === null ? MESSAGES_TELEPHONE.invalide : undefined;
}

/** Le numéro sans espaces ni points ; un numéro invalide (déjà signalé) part tel quel. */
export function telephoneAEnvoyer(saisie: string): string {
  return normaliserTelephone(saisie) ?? saisie.trim();
}

/**
 * « 0692 12 34 56 » pour « 0692123456 », la forme que l'API enregistre (10 chiffres). Un numéro
 * d'une autre forme est rendu tel quel plutôt que d'être déformé.
 */
export function telephoneLisible(telephone: string): string {
  if (!/^\d{10}$/.test(telephone)) return telephone;
  return `${telephone.slice(0, 4)} ${telephone.slice(4).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
}
