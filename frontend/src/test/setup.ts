import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { serveurApi } from './msw/serveur';

// 'error' : une requête qu'aucun handler ne simule fait échouer le test au lieu de partir sur le réseau.
beforeAll(() => serveurApi.listen({ onUnhandledFrame: 'error' }));

beforeEach(() => {
  // jsdom ne fait pas défiler la page et signale window.scrollTo comme non implémenté : un espion
  // neuf le remplace dans chaque test, et les tests de navigation peuvent l'interroger.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  // Sans les globals de Vitest, React Testing Library ne démonte pas les composants toute seule.
  cleanup();
  serveurApi.resetHandlers();
});

afterAll(() => serveurApi.close());
