/*
 * Règles de la clôture signée, vérifiées à l'écran pour guider le technicien (US33). Ce n'est
 * qu'un confort : le serveur les vérifie de nouveau et refuse en 400 (RG31, RG35).
 */

export const LONGUEUR_COMPTE_RENDU = 2000;
export const LONGUEUR_NOM_SIGNATAIRE = 100;
/** RG35 : 48 Ko une fois l'image décodée. */
export const TAILLE_MAXIMUM_IMAGE = 49_152;

export const MESSAGE_IMAGE_TROP_LOURDE =
  'La signature est trop lourde (plus de 48 Ko). Effacez-la et faites signer de nouveau.';

interface Saisie {
  compteRendu: string;
  nomSignataire: string;
  zoneVide: boolean;
}

/** Ce qui manque pour faire signer, dans l'ordre de la fenêtre ; vide si rien ne manque. */
export function raisonsDeBlocage({ compteRendu, nomSignataire, zoneVide }: Saisie): string[] {
  const raisons: string[] = [];
  if (compteRendu.trim() === '') raisons.push('Saisissez le compte rendu.');
  if (nomSignataire.trim() === '') raisons.push('Indiquez le nom du signataire.');
  if (zoneVide) raisons.push('Faites signer le client dans le cadre.');
  return raisons;
}

/** Taille en octets de l'image contenue dans une data URL en base64, sans la décoder. */
export function tailleDecodee(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const remplissage = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - remplissage;
}

export function estTropLourde(dataUrl: string): boolean {
  return tailleDecodee(dataUrl) > TAILLE_MAXIMUM_IMAGE;
}
