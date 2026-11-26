import type { Intervention } from '../api/types';
import { lienItineraire, lienTelephone } from './liens';

/** 44 px de haut au moins : une cible facile à toucher sur un téléphone. */
const BOUTON_LIEN =
  'inline-flex h-11 items-center rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-sarcelle-profonde hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';

/*
 * Le nom accessible est donné par aria-label : un texte masqué (sr-only) collé au libellé se lit
 * « AppelerMarie Dupont » selon les navigateurs. Il commence par le texte visible (WCAG 2.5.3) :
 * un utilisateur de commande vocale dit « Appeler » et trouve le bouton.
 */

/** #49 : appeler le client en un geste ; à l'écran, le bouton est à côté de son nom. */
export function LienAppeler({ nom, telephone }: { nom: string; telephone: string }) {
  return (
    <a href={lienTelephone(telephone)} aria-label={`Appeler ${nom}`} className={BOUTON_LIEN}>
      Appeler
    </a>
  );
}

/** #49 : itinéraire vers l'adresse, dans un nouvel onglet, sans lui donner accès à cette page. */
export function LienItineraire({
  adresse,
}: {
  adresse: Pick<Intervention['adresse'], 'rue' | 'codePostal' | 'ville'>;
}) {
  return (
    <a
      href={lienItineraire(adresse)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Itinéraire (nouvel onglet)"
      className={BOUTON_LIEN}
    >
      Itinéraire
    </a>
  );
}
