import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';

/**
 * Affiche une page seule, à une adresse donnée, sous le motif de route que lui donne App.tsx :
 * useParams y lit les mêmes paramètres et ses liens Link fonctionnent, sans session ni mise en page.
 */
export function afficherALAdresse(
  page: ReactElement,
  adresse: string,
  motif = adresse,
): RenderResult {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path={motif} element={page} />
      </Routes>
    </MemoryRouter>,
  );
}
