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

Le changement de mot de passe (`/mot-de-passe`, `PATCH /users/me/password`) n'est pas simulé : l'écran s'affiche mais l'envoi échoue avec une erreur générique. Il n'y a pas de compte ADMIN simulé : `GET /users` est simulé mais répond 403 au gestionnaire, comme l'API. La session simulée survit à un rechargement de la page : le faux serveur retient l'e-mail du compte connecté dans `sessionStorage` (clé `plumbly-simulation.compte`), jamais de jeton ; se déconnecter l'efface.

### Données de démonstration

Le jeu (`src/simulation/donneesDemonstration.ts`) est recréé à chaque chargement de la page, en mémoire : tout ce qui est créé, modifié ou archivé disparaît au rechargement.

- **Clients** (`clientsDemonstration.ts`) : treize clients de La Réunion aux noms accentués (Hélène Payet, Boulangerie Chez Mémé Grondin, Marie-Claude Hoarau…), dont un archivé (Marie-Thérèse Dijoux), un client à deux adresses (Hélène Payet) et un client dont l'ancienne adresse est archivée (Jean-Bernard Técher). La recherche ignore les accents et la casse et porte sur les mêmes champs que l'API (nom, prénom, raison sociale, téléphone, ville des adresses en service). Les interventions du planning et de la tournée du jour sont rattachées à ces clients : leur historique (`GET /clients/:id/interventions`) les montre.
- **Techniciens** : les trois techniciens du planning (Jean Rivière, Marie Técher, Paul Lebon) ont une fiche complète, plus une fiche archivée (Sébastien Payet). Une fiche créée ou archivée depuis l'écran apparaît ou disparaît aussitôt du planning. Chacun a une indisponibilité la semaine suivante ; Marie a en plus une formation le jeudi de la semaine en cours, visible au planning.
- **Comptes utilisateurs** (`comptesDemonstration.ts`) : pour créer une fiche technicien, saisir l'identifiant d'un compte TECHNICIEN libre, **8** (Julie Roche) ou **9** (Rémi Dijoux). Les autres identifiants reproduisent les refus de l'API : 10 (compte désactivé, 400), 1 (gestionnaire, 400), 4, 5, 6 ou 7 (déjà une fiche, 409), tout autre numéro (compte inexistant, 400).

Les faux serveurs (`handlersClients.ts`, `handlersTechniciens.ts`) reprennent les contrôles de l'API et leurs messages exacts (400 de validation, 404, 409 d'archivage ou de chevauchement d'une indisponibilité avec une intervention) ; `validationSimulee.ts` recopie les lecteurs de `backend/src/commun/validation.ts`.

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).

## Tests

Les tests tournent dans jsdom et n'appellent jamais le réseau : MSW intercepte les requêtes (`src/test/msw/`). Une requête qu'aucun handler ne simule fait échouer le test. Pour simuler une réponse dans un test :

```ts
serveurApi.use(http.get(urlApi('/clients'), () => HttpResponse.json([])));
```
