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

`npm run dev:simule` affiche les écrans sans back-end : MSW répond dans le navigateur (`src/simulation/`, service worker `public/mockServiceWorker.js`) avec des données de démonstration et une connexion simulée. Le code de simulation n'entre pas dans `npm run build`.

Le routeur et la connexion étant en place, http://localhost:5173/ redirige vers `/connexion` ; après connexion avec un compte de démonstration (ci-dessous), le gestionnaire arrive sur `/planning` (puis `/clients`, `/techniciens`) et le technicien sur `/ma-tournee`.

### Comptes de démonstration

La connexion est simulée elle aussi (`src/simulation/handlersAuthentification.ts`, comptes dans `src/simulation/comptesDemonstration.ts`) : sur http://localhost:5173/connexion, saisir l'un des e-mails ci-dessous et **n'importe quel mot de passe non vide**. Aucun mot de passe n'est défini, il n'y a donc aucun secret dans le dépôt ; un e-mail inconnu ou un mot de passe vide est refusé comme le ferait l'API.

| E-mail | Rôle | Écrans accessibles |
| --- | --- | --- |
| `gestion@plumbly.demo` | GESTIONNAIRE (Sophie Payet) | Planning, clients, techniciens |
| `technicien@plumbly.demo` | TECHNICIEN (Jean Rivière) | Ma tournée du jour, détail et fin d'intervention, signature |

Le changement de mot de passe (`/mot-de-passe`, `PATCH /users/me/password`) n'est pas simulé : l'écran s'affiche mais l'envoi échoue avec une erreur générique. Il n'y a pas de compte ADMIN simulé (ni de `GET /users`). La session simulée survit à un rechargement de la page : le faux serveur retient l'e-mail du compte connecté dans `sessionStorage` (clé `plumbly-simulation.compte`), jamais de jeton ; se déconnecter l'efface.

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).

## Tests

Les tests tournent dans jsdom et n'appellent jamais le réseau : MSW intercepte les requêtes (`src/test/msw/`). Une requête qu'aucun handler ne simule fait échouer le test. Pour simuler une réponse dans un test :

```ts
serveurApi.use(http.get(urlApi('/clients'), () => HttpResponse.json([])));
```
