interface Props {
  /** Nom de la zone, qui la distingue des autres statuts de la page : « Nombre de clients ». */
  etiquette: string;
  /**
   * Résultat de la dernière lecture aboutie : le total (« 12 clients ») ou, pour une liste vide, le
   * message affiché à sa place. null pendant une lecture et après une erreur.
   */
  texte: string | null;
}

/**
 * Résultat lu après une recherche ou un filtre (RGAA 7.5, US08, US09). La zone est montée en
 * permanence, hors du bloc de résultats qui se démonte : les lecteurs d'écran n'annoncent de façon
 * fiable que le changement de contenu d'une région déjà présente. Elle porte aussi le « Aucun… »
 * d'une liste vide, qui remplace le tableau par un nœud neuf. Vidée pendant chaque lecture, elle
 * change de contenu à chaque réponse, même quand le total reste le même. Masquée à l'écran : la
 * pagination et le message de liste vide affichent la même chose.
 */
export function AnnonceDuTotal({ etiquette, texte }: Props) {
  return (
    <p
      role="status"
      aria-label={etiquette}
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {texte}
    </p>
  );
}
