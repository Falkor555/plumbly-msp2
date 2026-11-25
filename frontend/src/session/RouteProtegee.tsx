import { Navigate, Outlet, useLocation } from 'react-router';
import type { Role } from '../api/auth.api';
import { EcranChargement } from '../commun/EcranChargement';
import { accueilDe } from './accueil';
import { useSession } from './session';

/**
 * Accès aux pages selon la session et le rôle. C'est un confort d'affichage, pas une sécurité :
 * l'API refuse elle-même toute requête sans jeton (401) ou d'un rôle non autorisé (403).
 */
export function RouteProtegee({ roles }: { roles: readonly Role[] }) {
  const { etat } = useSession();
  const location = useLocation();

  if (etat.statut === 'verification') {
    return <EcranChargement />;
  }
  if (etat.statut === 'deconnecte') {
    // La page demandée est retenue : la connexion y ramènera l'utilisateur.
    return <Navigate to="/connexion" replace state={{ depuis: location.pathname }} />;
  }
  if (!roles.includes(etat.profil.role)) {
    return <Navigate to={accueilDe(etat.profil.role)} replace />;
  }
  return <Outlet />;
}
