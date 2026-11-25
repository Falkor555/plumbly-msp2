import { LIEN } from './classes';

interface Props {
  /** Lien vers la page d'où l'on vient le plus probablement, par exemple la liste des clients. */
  retour: { href: string; libelle: string };
}

/** Adresse qui ne peut désigner aucune page ni aucune fiche : rien n'est demandé à l'API. */
export function PageIntrouvable({ retour }: Props) {
  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="text-sm text-gris-texte">
        Cette adresse ne correspond à aucune page. Vérifiez le lien, ou repartez de la liste.
      </p>
      <a href={retour.href} className={`${LIEN} text-sm font-semibold`}>
        {retour.libelle}
      </a>
    </main>
  );
}
