import type { ReactNode } from 'react';

/**
 * Message de succès (RGAA 7.5). La région live est toujours dans la page, vide au repos : les
 * lecteurs d'écran n'annoncent de façon fiable que le changement de contenu d'une région déjà
 * présente, pas une région insérée avec son texte. Sans role="status", elle ne se confond pas avec
 * les statuts de chargement de la page.
 */
export function ZoneAnnonce({ children }: { children: ReactNode }) {
  return (
    // Vide, la zone ne doit pas doubler l'espacement d'une pile (space-y) ; elle reste dans la page.
    <div aria-live="polite" aria-atomic="true" className="empty:my-0">
      {children && (
        <p className="rounded border border-succes/30 bg-succes-fond px-4 py-3 text-sm text-succes-texte">
          {children}
        </p>
      )}
    </div>
  );
}
