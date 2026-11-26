import { NavLink, Outlet } from 'react-router';
import { useSession } from '../session/session';

const LIEN =
  'rounded px-3 py-2 text-sm font-semibold text-gris-texte hover:bg-gray-100 aria-[current=page]:bg-sarcelle-claire aria-[current=page]:text-sarcelle-profonde';
const BOUTON_SECONDAIRE =
  'h-11 rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-sarcelle-profonde hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';

/**
 * Barre commune aux pages connectées : nom de l'application, navigation selon le rôle,
 * déconnexion (US02). Chaque page garde son propre <main> : une seule zone principale par page.
 */
export function MiseEnPage() {
  const { etat, deconnecter } = useSession();
  // RouteProtegee garantit une session ouverte avant d'afficher cette mise en page.
  if (etat.statut !== 'connecte') {
    return null;
  }
  const { profil } = etat;

  return (
    <>
      <header className="border-b border-bordure bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-2 md:px-8">
          <span className="font-titre text-lg font-bold text-sarcelle-profonde">Plumbly</span>
          {profil.role !== 'TECHNICIEN' && (
            <nav aria-label="Navigation principale" className="flex gap-1">
              <NavLink to="/planning" className={LIEN}>
                Planning
              </NavLink>
              <NavLink to="/interventions" className={LIEN}>
                Interventions
              </NavLink>
              {/* Sans « end » : le lien reste actif sur la fiche d'un client (/clients/:id). */}
              <NavLink to="/clients" className={LIEN}>
                Clients
              </NavLink>
              {/* De même sur la fiche d'un technicien (/techniciens/:id). */}
              <NavLink to="/techniciens" className={LIEN}>
                Techniciens
              </NavLink>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-gris-texte sm:inline">
              {profil.prenom} {profil.nom}
            </span>
            <NavLink to="/mot-de-passe" className={LIEN}>
              Mot de passe
            </NavLink>
            <button type="button" onClick={() => void deconnecter()} className={BOUTON_SECONDAIRE}>
              Se déconnecter
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
}
