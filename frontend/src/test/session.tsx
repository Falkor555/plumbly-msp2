import { render, type RenderResult } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Profil } from '../api/auth.api';
import { FournisseurSession } from '../session/FournisseurSession';
import { RouteProtegee } from '../session/RouteProtegee';
import { serveurApi, urlApi } from './msw/serveur';

export const ADMINISTRATEUR_DE_TEST: Profil = {
  id: 1,
  email: 'admin@plumbly.test',
  nom: 'Durand',
  prenom: 'Claire',
  role: 'ADMIN',
  mdpAChanger: false,
};

export const GESTIONNAIRE_DE_TEST: Profil = {
  id: 3,
  email: 'gestion@plumbly.test',
  nom: 'Martin',
  prenom: 'Sophie',
  role: 'GESTIONNAIRE',
  mdpAChanger: false,
};

// Les mêmes rôles que les pages de bureau d'App.tsx.
const ROLES_BUREAU = ['ADMIN', 'GESTIONNAIRE'] as const;

/**
 * Affiche une page de bureau à une adresse, avec une session restaurée comme au rechargement de
 * l'application (POST /auth/refresh puis GET /users/me, simulés pour ce profil) et la même garde
 * qu'App.tsx : la page n'apparaît qu'une fois le profil connu, et useSession y donne son rôle. Le
 * test efface ensuite le jeton d'accès gardé en mémoire (effacerJetonAcces).
 */
export function afficherAvecSession(
  page: ReactElement,
  profil: Profil,
  adresse: string,
  motif = adresse,
): RenderResult {
  serveurApi.use(
    http.post(urlApi('/auth/refresh'), () =>
      HttpResponse.json({ accessToken: 'jeton', expiresIn: 900 }),
    ),
    http.get(urlApi('/users/me'), () => HttpResponse.json(profil)),
  );
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <FournisseurSession>
        <Routes>
          <Route element={<RouteProtegee roles={ROLES_BUREAU} />}>
            <Route path={motif} element={page} />
          </Route>
        </Routes>
      </FournisseurSession>
    </MemoryRouter>,
  );
}
