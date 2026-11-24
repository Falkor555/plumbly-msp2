# Plumbly : API (NestJS)

API REST de Plumbly, organisée en couches (ADR 0003). Toutes les routes sont préfixées par `/api/v1`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run start:dev` | Lance l'API avec rechargement à chaud (port 3000) |
| `npm run build` | Compile dans `dist/` |
| `npm run test` | Tests unitaires (Vitest, fichiers `src/**/*.spec.ts`) |
| `npm run test:e2e` | Tests d'intégration (Supertest + PostgreSQL et MongoDB éphémères via Testcontainers ; Docker doit tourner) |
| `npm run test:cov` | Tests unitaires avec couverture |

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).

## Base de données (Prisma)

Le schéma `prisma/schema.prisma` traduit le MLD de [docs/modele-donnees.md](../docs/modele-donnees.md). Le client Prisma est généré dans `src/generated/prisma` (non versionné) par les scripts `build`, `start:dev` et `test`.

| Commande (dans `backend/`) | Rôle |
| --- | --- |
| `npx prisma migrate dev --name <nom>` | Crée une migration après une modification du schéma et l'applique |
| `npx prisma migrate deploy` | Applique les migrations en attente (lancé automatiquement par `npm run start:dev`) |
| `npx prisma db seed` | Vide la base et la remplit avec les données de test (`prisma/seed.ts`) |
| `npx prisma studio` | Explore les données dans le navigateur |

Dans Docker, préfixer par `docker compose exec backend`, par exemple `docker compose exec backend npx prisma db seed`.

Points d'attention :

- Les contraintes que Prisma ne sait pas décrire (CHECK, unicité différée du rang dans une tournée, colonne générée `fin_prevue`) sont écrites à la main à la fin de `prisma/migrations/20261124000000_schema_initial/migration.sql`. Une future migration qui touche ces colonnes doit les reprendre à la main.
- `fin_prevue` est calculée par PostgreSQL : ne jamais l'écrire depuis l'API.
- Les dates sont des `timestamptz` (stockées en UTC). La session PostgreSQL de l'API est forcée en UTC (`src/prisma/adaptateur-postgres.ts`) : sans ce réglage, l'adaptateur Prisma décale toutes les dates de 4 heures, car le conteneur tourne en `Indian/Reunion`.
- Le seed hache les mots de passe en argon2id avec `node:crypto` (Node 24) au format standard PHC, lisible par les bibliothèques argon2.

Dans Docker, l'API reçoit `DATABASE_URL` et `MONGODB_URI` depuis `docker-compose.yml`. Pour la lancer hors Docker, voir la fin de `.env.example`.

**`MONGODB_URI` est obligatoire, même hors Docker** : sans elle, l'API refuse de démarrer. Copier la ligne `MONGODB_URI=…` de la fin de `.env.example` dans `backend/.env`. Si MongoDB est seulement éteint, l'API démarre avec un avertissement : les actions métier fonctionnent, le journal n'est pas écrit et l'historique des statuts répond `503`.

## Tests d'intégration

Les fichiers `test/**/*.e2e-spec.ts` partagent une base PostgreSQL et une base MongoDB démarrées une seule fois par `test/support/base-de-test.global-setup.ts`. Leurs adresses arrivent dans `process.env.DATABASE_URL` et `process.env.MONGODB_URI`, comme en production. Seul `test/journal.e2e-spec.ts` écrit dans MongoDB ; les autres fichiers simulent le journal. Les fichiers s'exécutent l'un après l'autre pour ne pas mélanger leurs données.
