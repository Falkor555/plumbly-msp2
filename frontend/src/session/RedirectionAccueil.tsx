import { Navigate } from 'react-router';
import { EcranChargement } from '../commun/EcranChargement';
import { accueilDe } from './accueil';
import { useSession } from './session';

/** Adresse inconnue ou racine : l'accueil du rôle, ou la connexion sans session. */
export function RedirectionAccueil() {
  const { etat } = useSession();
  if (etat.statut === 'verification') {
    return <EcranChargement />;
  }
  if (etat.statut === 'deconnecte') {
    return <Navigate to="/connexion" replace />;
  }
  return <Navigate to={accueilDe(etat.profil.role)} replace />;
}
