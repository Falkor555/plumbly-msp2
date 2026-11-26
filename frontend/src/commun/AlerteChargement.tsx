interface Props {
  message: string;
  onReessayer: () => void;
}

/** Échec d'une lecture de l'API, avec de quoi la relancer (même présentation que le planning). */
export function AlerteChargement({ message, onReessayer }: Props) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded border border-erreur/30 bg-erreur-fond px-4 py-3 text-sm text-erreur-texte"
    >
      {message}
      <button type="button" onClick={onReessayer} className="ml-auto font-semibold underline">
        Réessayer
      </button>
    </div>
  );
}
