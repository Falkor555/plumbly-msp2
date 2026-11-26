import type { ReactNode } from 'react';

/**
 * Message de succès (RGAA 7.5). La région live est toujours dans la page, vide au repos : les
 * lecteurs d'écran n'annoncent de façon fiable que le changement de contenu d'une région déjà
 * présente, pas une région insérée avec son texte. Son nom « Confirmation » la distingue des
 * autres statuts de la page (chargement, nombre de résultats). aria-live et aria-atomic, déjà
 * implicites avec role="status", restent écrits pour les lecteurs d'écran qui ne les déduisent pas.
 */
export function ZoneAnnonce({ children }: { children: ReactNode }) {
  return (
    // Vide, la zone ne doit pas doubler l'espacement d'une pile (space-y) ; elle reste dans la page.
    <div
      role="status"
      aria-label="Confirmation"
      aria-live="polite"
      aria-atomic="true"
      className="empty:my-0"
    >
      {children && (
        <p className="rounded border border-succes/30 bg-succes-fond px-4 py-3 text-sm text-succes-texte">
          {children}
        </p>
      )}
    </div>
  );
}
