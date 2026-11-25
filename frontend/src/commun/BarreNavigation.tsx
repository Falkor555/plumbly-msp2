/** Rubrique de l'application à laquelle appartient la page affichée. */
export type Rubrique = 'planning' | 'clients';

const LIENS: { rubrique: Rubrique; href: string; libelle: string }[] = [
  { rubrique: 'planning', href: '/', libelle: 'Planning' },
  { rubrique: 'clients', href: '/clients', libelle: 'Clients' },
];

const LIEN =
  'inline-flex h-11 items-center border-b-2 px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';

interface Props {
  rubrique: Rubrique;
  /** Chemin de la page affichée, par exemple « /clients/7 ». */
  chemin: string;
}

/**
 * Navigation provisoire des écrans du gestionnaire, en attendant le layout de l'issue #9 : de
 * simples liens, la page étant choisie au chargement d'après son adresse.
 */
export function BarreNavigation({ rubrique, chemin }: Props) {
  return (
    <nav aria-label="Navigation principale" className="border-b border-bordure bg-white">
      <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-4 md:px-8">
        <span className="font-titre text-base font-bold text-sarcelle-profonde">Plumbly</span>
        <ul className="flex">
          {LIENS.map((lien) => (
            <li key={lien.rubrique}>
              <a
                href={lien.href}
                aria-current={etatCourant(lien.href, lien.rubrique === rubrique, chemin)}
                className={`${LIEN} ${
                  lien.rubrique === rubrique
                    ? 'border-sarcelle text-sarcelle-profonde'
                    : 'border-transparent text-gris-texte hover:text-anthracite'
                }`}
              >
                {lien.libelle}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/**
 * « page » seulement si le lien mène à la page affichée : sur une fiche client, le lien Clients
 * mène à la liste, pas à la fiche. Il porte alors « true », l'élément courant de la navigation.
 */
function etatCourant(
  href: string,
  dansLaRubrique: boolean,
  chemin: string,
): 'page' | 'true' | undefined {
  if (!dansLaRubrique) return undefined;
  // « /clients/ » affiche la même page que « /clients ».
  const cheminSansBarreFinale = chemin.replace(/\/+$/, '') || '/';
  return cheminSansBarreFinale === href ? 'page' : 'true';
}
