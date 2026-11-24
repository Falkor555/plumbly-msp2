# Plumbly : front-end (React + Vite)

Application monopage de Plumbly (ADR 0004).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement sur http://localhost:5173 |
| `npm run build` | Vérifie les types puis construit dans `dist/` |
| `npm run preview` | Sert la version construite |
| `npm run test` | Tests Vitest + React Testing Library (fichiers `src/**/*.test.{ts,tsx}`) |
| `npm run test:watch` | Mêmes tests, relancés à chaque modification |

Les appels vers `/api` sont relayés par Vite vers l'API (`http://localhost:3000` par défaut, `http://backend:3000` dans Docker).

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).

## Tests

Les tests tournent dans jsdom et n'appellent jamais le réseau : MSW intercepte les requêtes (`src/test/msw/`). Une requête qu'aucun handler ne simule fait échouer le test. Pour simuler une réponse dans un test :

```ts
serveurApi.use(http.get(urlApi('/clients'), () => HttpResponse.json([])));
```
