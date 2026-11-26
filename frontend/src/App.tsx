import { BrowserRouter, Route, Routes } from 'react-router';
import { PageClients } from './clients/PageClients';
import { PageFicheClient } from './clients/PageFicheClient';
import { PageConnexion } from './connexion/PageConnexion';
import { PageFicheIntervention } from './interventions/PageFicheIntervention';
import { PageInterventions } from './interventions/PageInterventions';
import { PageNouvelleIntervention } from './interventions/PageNouvelleIntervention';
import { PageMaTournee } from './ma-tournee/PageMaTournee';
import { MiseEnPage } from './mise-en-page/MiseEnPage';
import { PageMotDePasse } from './mot-de-passe/PageMotDePasse';
import { PagePlanning } from './planning/PagePlanning';
import { FournisseurSession } from './session/FournisseurSession';
import { RedirectionAccueil } from './session/RedirectionAccueil';
import { RouteProtegee } from './session/RouteProtegee';
import { PageFicheTechnicien } from './techniciens/PageFicheTechnicien';
import { PageTechniciens } from './techniciens/PageTechniciens';

const ROLES_BUREAU = ['ADMIN', 'GESTIONNAIRE'] as const;
const ROLES_TERRAIN = ['TECHNICIEN'] as const;

/**
 * Routes de l'application (#9, #14). La protection des pages est un confort d'affichage :
 * la sécurité est assurée par l'API (401 sans jeton, 403 pour un rôle non autorisé).
 */
export default function App() {
  return (
    <BrowserRouter>
      <FournisseurSession>
        <Routes>
          <Route path="/connexion" element={<PageConnexion />} />
          <Route path="/mot-de-passe" element={<PageMotDePasse />} />
          <Route element={<RouteProtegee roles={ROLES_BUREAU} />}>
            <Route element={<MiseEnPage />}>
              <Route path="/planning" element={<PagePlanning />} />
              <Route path="/interventions" element={<PageInterventions />} />
              <Route path="/interventions/nouvelle" element={<PageNouvelleIntervention />} />
              <Route path="/interventions/:id" element={<PageFicheIntervention />} />
              <Route path="/clients" element={<PageClients />} />
              <Route path="/clients/:id" element={<PageFicheClient />} />
              <Route path="/techniciens" element={<PageTechniciens />} />
              <Route path="/techniciens/:id" element={<PageFicheTechnicien />} />
            </Route>
          </Route>
          <Route element={<RouteProtegee roles={ROLES_TERRAIN} />}>
            <Route element={<MiseEnPage />}>
              <Route path="/ma-tournee" element={<PageMaTournee />} />
            </Route>
          </Route>
          <Route path="*" element={<RedirectionAccueil />} />
        </Routes>
      </FournisseurSession>
    </BrowserRouter>
  );
}
