import { useRef } from 'react';
import { Link } from 'react-router';
import { LIEN } from './classes';
import { useArriveeSurLaPage } from './useArriveeSurLaPage';

interface Props {
  /** Lien vers la page d'où l'on vient le plus probablement, par exemple la liste des clients. */
  retour: { vers: string; libelle: string };
}

/** Adresse qui ne peut désigner aucune page ni aucune fiche : rien n'est demandé à l'API. */
export function PageIntrouvable({ retour }: Props) {
  const zonePrincipale = useRef<HTMLElement>(null);
  useArriveeSurLaPage(zonePrincipale);
  return (
    // Cible du focus à l'arrivée sur la page ; hors de l'ordre de tabulation.
    <main
      ref={zonePrincipale}
      tabIndex={-1}
      className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 focus:outline-none md:px-8"
    >
      <h1 className="text-2xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="text-sm text-gris-texte">
        Cette adresse ne correspond à aucune page. Vérifiez le lien, ou repartez de la liste.
      </p>
      <Link to={retour.vers} className={`${LIEN} text-sm font-semibold`}>
        {retour.libelle}
      </Link>
    </main>
  );
}
