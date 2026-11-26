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

### Ce qui est simulé

Tous les écrans du gestionnaire et du technicien tournent sans back-end. Les faux serveurs sont réunis par `creerHandlersDeSimulation` (`src/simulation/handlersDeSimulation.ts`) : le mode simulé et le test du parcours complet (`parcoursSimule.test.tsx`, connexion, planning, clients, techniciens, déconnexion) utilisent la même liste, et ce test échoue si l'un des écrans qu'il parcourt appelle une route non simulée ou n'affiche pas ses données. Les autres écrans (ma tournée, formulaires, export, assistant d'import) ont leurs propres tests ; les faux serveurs de la connexion, des clients, des techniciens et de l'export-import sont testés à part (`handlers*.test.ts`).

| Domaine | Routes simulées | Faux serveur |
| --- | --- | --- |
| Connexion | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /users/me` | `handlersAuthentification.ts` |
| Planning | `GET /tours`, `POST /tours`, `POST /tours/:id/interventions`, `GET /interventions`, `GET /tours/me/today` | `handlersPlanning.ts` |
| Interventions (terrain) | `GET /interventions/:id`, démarrage, fin avec ou sans signature, compte rendu, signature | `handlersInterventions.ts` |
| Clients et adresses | liste, fiche, création, modification, archivage, adresses, historique | `handlersClients.ts` |
| Techniciens et indisponibilités | liste, fiche, création, modification, archivage, indisponibilités ; `GET /users` (ADMIN) | `handlersTechniciens.ts` |
| Export et import CSV des clients | `GET /clients/export`, `POST /clients/import/analysis`, `POST /clients/import` | `handlersExportImport.ts`, avec `csvSimule.ts` et `analyseImportSimulee.ts` |

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

Les faux serveurs (`handlersClients.ts`, `handlersTechniciens.ts`, `handlersExportImport.ts`) reprennent les contrôles de l'API et leurs messages exacts (400 de validation, 404, 409 d'archivage ou de chevauchement d'une indisponibilité avec une intervention) ; `validationSimulee.ts` recopie les lecteurs de `backend/src/commun/validation.ts`.

### Export et import CSV

- **Export** (« Exporter en CSV » sur la liste des clients) : un vrai fichier `clients-AAAA-MM-JJ.csv` (jour de La Réunion), comme celui de l'API : UTF-8 avec BOM, séparateur `;`, fins de ligne CRLF, colonnes du back dans le même ordre (`id;type_client;nom;prenom;raison_sociale;telephone;email;rue;complement;code_postal;ville;infos_acces;archive;cree_le`), une ligne par adresse en service, mêmes filtres et même tri que la liste affichée, guillemets RFC 4180 et formules neutralisées par une apostrophe (RG26).
- **Import** (« Importer ») : l'analyse découpe le fichier, propose la correspondance des colonnes et classe chaque ligne (`VALIDE`, `DOUBLON` d'un client existant par le téléphone ou l'e-mail, `INVALIDE` avec les motifs de l'API), sans rien enregistrer. L'import, en ignorant les doublons ou en mettant à jour les clients existants, crée ou modifie réellement les clients du jeu : ils apparaissent aussitôt dans la liste et sur leur fiche. Un fichier exporté puis réimporté tel quel ne donne que des doublons.

Fichier d'essai, à enregistrer en UTF-8 (la ligne 3 est un doublon d'Hélène Payet, la ligne 4 a un téléphone invalide) :

```csv
nom;prenom;Tél.;Courriel;adresse;CP;ville
Grondin;Lucette;0692 55 66 77;;5 rue des Goyaviers;97410;Saint-Pierre
Payet;Hélène;0692 12 34 56;;12 rue des Lilas;97400;Saint-Denis
Hoarau;Alix;06921;;3 rue du Port;97420;Le Port
```

### Limites du mode simulé

- **Pas de compte ADMIN** : la création d'une fiche technicien demande toujours l'identifiant du compte (8 ou 9, voir plus haut) ; la liste des comptes TECHNICIEN sans fiche, réservée à l'administrateur (`GET /users`), ne s'affiche jamais.
- **Séparateur de l'import** : `;` ou `,` seulement, détecté sur la ligne d'en-têtes (`;` à égalité) ou choisi dans l'assistant.
- **En-têtes de l'import** : reconnus sans tenir compte de la casse, des accents, des espaces, de `_`, `-` et `.`, par les seuls synonymes de l'API (`Tel`, `Mobile`, `Portable`, `Courriel`, `CP`, `Commune`, `Digicode`…, liste complète dans `docs/import-export-csv.md`, section 4.3). Toute autre colonne est ignorée, sauf si l'assistant lui attribue un champ ; un champ obligatoire sans colonne (téléphone, rue, code postal, ville, nom ou raison sociale) fait refuser le fichier.
- **Taille** : 1 Mo au plus, contrôlé par l'écran avant l'envoi ; 1 000 000 caractères et 1 000 lignes de données au plus, refusés en 400 par le faux serveur. Le 413 de l'API (corps de plus de 1,5 Mo) n'est pas simulé. L'export est limité à 5 000 lignes comme l'API.
- Ni journal des actions (RG25), ni verrou d'import (409 « Un import est déjà en cours »), ni transaction (RG29) : tout se passe en mémoire, dans un seul onglet.
- Hors connexion et `GET /users`, les faux serveurs ne contrôlent ni le jeton ni le rôle : ce sont les routes protégées de l'application qui renvoient vers la connexion.

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).

## Tests

Les tests tournent dans jsdom et n'appellent jamais le réseau : MSW intercepte les requêtes (`src/test/msw/`). Une requête qu'aucun handler ne simule fait échouer le test. Pour simuler une réponse dans un test :

```ts
serveurApi.use(http.get(urlApi('/clients'), () => HttpResponse.json([])));
```
