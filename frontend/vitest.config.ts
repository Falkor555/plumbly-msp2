import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Fuseau des tests figé sur UTC, avant le lancement des processus de test qui en héritent : un poste
// réglé sur un fuseau à +04:00 (Dubaï, Maurice) se confondrait avec La Réunion, et un formatage
// qui oublierait timeZone: 'Indian/Reunion' passerait alors inaperçu.
process.env.TZ = 'UTC';

// Reprend la configuration de Vite (plugin React) pour que les tests compilent le code comme l'application.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      env: {
        // fetch de Node refuse les URL relatives (pas de page d'origine comme dans le navigateur) :
        // les tests visent donc une URL absolue, interceptée par MSW, jamais un vrai serveur.
        VITE_API_URL: 'http://localhost/api/v1',
      },
      // Vitest vide les feuilles de style par défaut : le test des contrastes lit les jetons de la
      // charte dans index.css (import « ?raw »), il lui faut donc son vrai contenu.
      css: { include: [/\/src\/index\.css/] },
      restoreMocks: true,
      unstubGlobals: true,
    },
  }),
);
