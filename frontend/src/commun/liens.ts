import type { Intervention } from '../api/types';

/** Garde les chiffres et le « + » : un numéro saisi « 0692 12 34 56 » donne un lien tel: valide. */
export function lienTelephone(telephone: string): string {
  return `tel:${telephone.replace(/[^+\d]/g, '')}`;
}

/**
 * Itinéraire Google Maps vers l'adresse (US24). Le complément (bâtiment, étage) est laissé de côté :
 * il gêne la géolocalisation et le technicien le lit sur la carte de l'étape.
 */
export function lienItineraire(
  adresse: Pick<Intervention['adresse'], 'rue' | 'codePostal' | 'ville'>,
): string {
  const destination = `${adresse.rue}, ${adresse.codePostal} ${adresse.ville}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
