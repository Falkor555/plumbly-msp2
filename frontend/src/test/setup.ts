import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { serveurApi } from './msw/serveur';

// 'error' : une requête qu'aucun handler ne simule fait échouer le test au lieu de partir sur le réseau.
beforeAll(() => serveurApi.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  // Sans les globals de Vitest, React Testing Library ne démonte pas les composants toute seule.
  cleanup();
  serveurApi.resetHandlers();
});

afterAll(() => serveurApi.close());
