interface Props {
  libelleAccessible: string;
  onClick: () => void;
}

export function BoutonAffecter({ libelleAccessible, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelleAccessible}
      className="w-full rounded border border-dashed border-bordure px-2 py-1 text-xs font-medium text-gris-texte transition-colors hover:border-sarcelle hover:bg-sarcelle-claire hover:text-sarcelle-profonde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle"
    >
      + Affecter
    </button>
  );
}
