# Plumbly : front-end (React + Vite)

Application monopage de Plumbly (ADR 0004).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement sur http://localhost:5173 |
| `npm run dev:simule` | Même serveur, avec l'API simulée par MSW et des données de démonstration |
| `npm run build` | Vérifie les types puis construit dans `dist/` |
| `npm run preview` | Sert la version construite |
| `npm run test` | Tests Vitest + React Testing Library (fichiers `src/**/*.test.{ts,tsx}`) |
| `npm run test:watch` | Mêmes tests, relancés à chaque modification |

Les appels vers `/api` sont relayés par Vite vers l'API (`http://localhost:3000` par défaut, `http://backend:3000` dans Docker).

## Mode simulé

`npm run dev:simule` affiche les écrans sans back-end : MSW répond dans le navigateur (`src/simulation/`, service worker `public/mockServiceWorker.js`). Il sert tant que l'authentification (#13) et la liste des interventions (#17) ne sont pas livrées. Les données sont de démonstration et le code de simulation n'entre pas dans `npm run build`.

En attendant le routeur de l'issue #9, `App.tsx` aiguille à la main : http://localhost:5173/ affiche le planning du gestionnaire, http://localhost:5173/ma-tournee la tournée du technicien.

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).

## Tests

Les tests tournent dans jsdom et n'appellent jamais le réseau : MSW intercepte les requêtes (`src/test/msw/`). Une requête qu'aucun handler ne simule fait échouer le test. Pour simuler une réponse dans un test :

```ts
serveurApi.use(http.get(urlApi('/clients'), () => HttpResponse.json([])));
```
