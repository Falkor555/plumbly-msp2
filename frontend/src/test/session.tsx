import {
  render,
  type RenderResult,
  screen,
  waitForElementToBeRemoved,
} from '@testing-library/react';
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
 *
 * La promesse se résout quand l'écran « Chargement… » de la session a disparu, donc quand la page
 * est montée et a lancé ses propres lectures. Sans cette étape, le premier findBy… du test devait
 * couvrir à lui seul la restauration de session et la lecture de la page, soit trois allers-retours
 * MSW enchaînés dans le délai de 1 s de Testing Library : sur un poste chargé, il échouait (#66).
 */
export async function afficherAvecSession(
  page: ReactElement,
  profil: Profil,
  adresse: string,
  motif = adresse,
): Promise<RenderResult> {
  serveurApi.use(
    http.post(urlApi('/auth/refresh'), () =>
      HttpResponse.json({ accessToken: 'jeton', expiresIn: 900 }),
    ),
    http.get(urlApi('/users/me'), () => HttpResponse.json(profil)),
  );
  const rendu = render(
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
  // Texte exact de l'écran de vérification de la session, distinct des « Chargement de … » des pages.
  await waitForElementToBeRemoved(() => screen.queryByText('Chargement…'));
  return rendu;
}
