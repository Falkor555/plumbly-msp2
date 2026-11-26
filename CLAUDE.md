# CLAUDE.md — Plumbly

Progiciel de gestion des tournées de plombiers, projet MSP2 du titre CDA (binôme Loïc BOTSY,
Arnaud BIDEL). Tout est écrit en **français** : code métier, commentaires, tests, commits, docs.

## Où chercher avant d'écrire

| Sujet | Source qui fait foi |
| --- | --- |
| Besoin, règles de gestion (RGxx), répartition du binôme | `docs/cahier-des-charges.md` |
| User stories (USxx), personas | `docs/user-stories.md`, `docs/personas.md` |
| Routes, codes d'erreur, pagination `{ data, meta }` | `docs/api.md` (contrat à tenir à jour) |
| Modèle de données (MCD/MLD) | `docs/modele-donnees.md`, `backend/prisma/schema.prisma` |
| Décisions techniques | `docs/adr/` (index dans `docs/adr/README.md`) |
| Import/export CSV | `docs/import-export-csv.md` |
| Prisma, migrations, seed, journal MongoDB | `backend/README.md` |
| Mode simulé, MSW, tests front | `frontend/README.md` |

Un ADR accepté ne se modifie pas : on en écrit un nouveau qui le remplace (voir `docs/adr/README.md`).

## Stack

- Monorepo npm : `backend/`, `frontend/`, outillage commun à la racine. Node 24 (`.nvmrc`), ESM partout.
- **Back** : NestJS 12, TypeScript 6, en couches contrôleur → service → repository (ADR 0003),
  préfixe `/api/v1`, Swagger. PostgreSQL 17 via **Prisma 7** (générateur `prisma-client`, client
  généré dans `backend/src/generated/prisma`, non versionné) + SQL écrit à la main
  (`$queryRaw`, reporting, verrous). **MongoDB 8** pour le journal des actions (ADR 0006).
- **Front** : React 19, Vite 8, Tailwind 4 (jetons dans `frontend/src/index.css`), MSW 3.
- **Tests** : Vitest partout (ADR 0011), React Testing Library, Supertest, Testcontainers.
- Docker Compose pour le développement (ADR 0009).

## Commandes (PowerShell, pas cmd)

Le poste est sous Windows : lancer les commandes dans **PowerShell** (fnm et npm ne marchent pas
dans cmd). Depuis la racine du dépôt :

```powershell
npm run lint            # ESLint sur frontend/ et backend/
npm run format:check    # Prettier, sans rien modifier (npm run format pour appliquer)
npm run test            # tests unitaires back puis front
npm run test:e2e        # tests d'intégration de l'API : Docker Desktop doit tourner
docker compose up --build             # front :5173, API :3000, PostgreSQL, MongoDB
docker compose up -d --build -V       # après un ajout de dépendance (volume node_modules)
```

Dans `frontend/` : `npm run dev:simule` affiche les écrans sans back-end (API simulée par MSW).
Dans `backend/` : `npx prisma migrate dev --name <nom>`, `npx prisma db seed` (exige `SEED_MOT_DE_PASSE`).

Relancer seulement les tests en échec pendant une correction :
`npx vitest run chemin/du/fichier` (dans `backend/` ou `frontend/`), ou
`npx vitest run --config ./vitest.config.e2e.ts test/xxx.e2e-spec.ts` pour un e2e.

## Conventions du back-end

- **Couches** : par module, `*.controller.ts` (HTTP, rôles), `*.validation.ts` (lecture des
  entrées), `*.service.ts` (règles, ni HTTP ni SQL), `*.repository.ts` (seul accès aux données),
  `*.presentation.ts` (forme JSON renvoyée), `*.types.ts`.
- **Validation écrite à la main** avec `backend/src/commun/validation.ts` (`lireObjet`,
  `lireTexte`, `lireEntier`, `signalerErreurs`…). Pas de class-validator, ni class-transformer.
  Tout champ inconnu est refusé en 400 (`lireObjet` avec la liste des champs autorisés).
- **Autorisation** : toute route porte `RolesGuard` et `@Roles(...)` ; une route sans `@Roles`
  reste fermée. Vérifier aussi le droit sur la ressource elle-même (le technicien ne touche qu'à
  ses interventions), pas seulement le rôle.
- **Journal MongoDB** : injecter `JournalDesActions`, ne jamais importer `mongodb` dans un module
  métier. Appeler `enregistrer()` **après** la validation de la transaction PostgreSQL, jamais
  dedans. `enregistrer()` ne lève jamais : pas de try/catch chez l'appelant. Les 403 sont
  journalisés par `FiltreAccesRefuse`. Mode d'emploi complet : `backend/src/journal/journal-des-actions.ts`.
- **Verrous** : dans une transaction de planning, toujours dans l'ordre
  **technicien → tournée → intervention** (`SELECT … FOR UPDATE` paramétré, voir
  `backend/src/tournees/operations-verrouillees.ts`).
- **SQL** : requêtes paramétrées uniquement (`$queryRaw` en gabarit), jamais `$queryRawUnsafe`
  ni concaténation. Les CHECK, l'unicité différée du rang et `fin_prevue` sont écrits à la main
  dans la migration initiale : une migration qui touche ces colonnes doit les reprendre.
- **Dates et fuseau** : fuseau métier `Indian/Reunion` (`commun/fuseau-metier.ts`), dates en
  `timestamptz` stockées en UTC, session PostgreSQL forcée en UTC (`prisma/adaptateur-postgres.ts`,
  ne pas retirer). L'heure courante vient de `Horloge` (injectée) : jamais `new Date()` dans une
  règle, pour que les tests figent le temps.
- **Messages d'erreur** : en français, génériques pour un 500 (aucun détail SQL ne sort).
- **Imports** : relatifs avec l'extension `.js`, sauf le client Prisma généré (`.ts`).

## Conventions du front-end

- Appels réseau uniquement par `frontend/src/api/` (`clientHttp`, `ErreurApi`) ; jeton d'accès
  en mémoire, jamais dans le stockage du navigateur ni dans une URL.
- **Charte** : sarcelle `#0F766E`, sarcelle profonde `#0B4F4A`, orange chantier `#AF4C00`,
  anthracite `#27313F` ; polices Plus Jakarta Sans (titres) et Inter. Utiliser les jetons
  Tailwind de `index.css` (`bg-sarcelle`, `text-anthracite`…), pas de couleur en dur.
- **Accessibilité** : contraste du texte d'au moins **4,5:1** sur son fond (le calculer, surtout
  pour un texte coloré sur fond clair) ; libellés et rôles ARIA utilisables par Testing Library.
- Routes déclarées dans `App.tsx` (React Router, #9 et #14) ; `RouteProtegee` n'est qu'un confort
  d'affichage : la sécurité reste côté API (401, 403).

## Tests

- Vitest partout. Unitaires : `backend/src/**/*.spec.ts`, `frontend/src/**/*.test.{ts,tsx}`.
  Intégration : `backend/test/**/*.e2e-spec.ts` (PostgreSQL et MongoDB éphémères, fichiers
  exécutés l'un après l'autre).
- Le nom d'un test commence par l'identifiant qu'il prouve : `TS-xx` (mesure de sécurité),
  `TIxx` (test d'intégration), `RGxx` (règle de gestion) ou `USxx` (user story), puis la condition
  et le résultat attendu. Exemple : `'TI07 : répond 403 au technicien qui termine l’intervention
  d’un collègue, sans rien changer en base'`.
- **Toute nouvelle route** doit être ajoutée à `backend/test/securite.e2e-spec.ts` : matrices
  `ROUTES_QUI_LISENT_UN_CORPS` / `ROUTES_QUI_LISENT_LA_REQUETE` et compteurs du test TS-05 ; une
  route publique s'ajoute à `CONTROLEURS_PUBLICS` avec sa raison.
- Front : aucun appel réseau réel, MSW intercepte (`src/test/msw/`) ; une requête non simulée
  fait échouer le test.
- Jamais de `skip`, d'assertion affaiblie ni de test supprimé pour passer au vert.

## Git

- Branche par issue depuis `develop` (`N-titre-court`), PR vers `develop`, relecture de l'autre
  membre du binôme, `Closes #N` (ADR 0010). Ne pas travailler sur `main`.
- Commits en français, au présent, format conventionnel avec le numéro d'issue :
  `feat(clients): exporte en CSV la liste filtrée des clients (US32) (#47)`.
  Types utilisés : `feat`, `fix`, `test`, `docs`, `style`, `refactor`.
- **Ne jamais pousser** (`git push`) ni ouvrir de PR : le développeur relit et pousse lui-même.
  Ne jamais committer `.env` ni un secret ; aucune valeur sensible en dur, même dans un test.
- Fins de ligne LF (`.gitattributes`), Prettier : guillemets simples, 100 colonnes.

## Ce qui appartient à Loïc

Authentification et rôles côté API (**#13** : JWT, argon2, `/auth/*`, `/users/*`), pages de
connexion et routes protégées (**#14**), routeur et layout du front (**#9**), toutes fusionnées ;
tests d'intégration de l'API (#12), maquettes connexion/interventions (#26). Ne pas modifier ces
parties sans accord. Depuis #13, `AuthentificationGuard` (APP_GUARD) vérifie le jeton sur
toutes les routes et remplit `request.user` ; une route sans jeton porte `@Public()`.

## Interdits

- Ajouter une dépendance sans accord explicite.
- Modifier un ADR accepté, ou s'écarter de `docs/api.md` sans le mettre à jour dans la même PR.
- Toucher à des fichiers hors du périmètre de la tâche (renommage ou reformatage opportuniste).
- Écrire dans `backend/src/generated/` ou écrire `fin_prevue` depuis l'API.

## Définition de terminé

1. `npm run lint`, `npm run format:check`, `npm run test` et, si le back a changé,
   `npm run test:e2e` passent (dire lesquels ont été lancés, et leur résultat).
2. Les cas nominal, limites, erreurs et effets de bord (journal, base) sont testés.
3. Une nouvelle route figure dans `docs/api.md` et dans `securite.e2e-spec.ts`.
4. Un choix technique nouveau a son ADR ; la doc concernée (README, `docs/`) est à jour.
5. Les commits suivent le format ci-dessus ; rien n'est poussé.
