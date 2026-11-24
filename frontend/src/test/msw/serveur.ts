import { setupServer } from 'msw/node';
import { handlersParDefaut } from './handlers';

// Définie dans vitest.config.ts.
const URL_API_TEST = import.meta.env.VITE_API_URL;
if (!URL_API_TEST) throw new Error('VITE_API_URL doit être défini dans vitest.config.ts');

export const serveurApi = setupServer(...handlersParDefaut);

export function urlApi(chemin: string): string {
  return `${URL_API_TEST}${chemin}`;
}
