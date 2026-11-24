import { setupServer } from 'msw/node';
import { handlersParDefaut } from './handlers';

// Définie dans vitest.config.ts.
const URL_API_TEST: string = import.meta.env.VITE_API_URL;

export const serveurApi = setupServer(...handlersParDefaut);

export function urlApi(chemin: string): string {
  return `${URL_API_TEST}${chemin}`;
}
