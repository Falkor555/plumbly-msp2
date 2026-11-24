# Plumbly : API (NestJS)

API REST de Plumbly, organisée en couches (ADR 0003). Toutes les routes sont préfixées par `/api/v1`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run start:dev` | Lance l'API avec rechargement à chaud (port 3000) |
| `npm run build` | Compile dans `dist/` |
| `npm run test` | Tests unitaires (Vitest, fichiers `src/**/*.spec.ts`) |
| `npm run test:e2e` | Tests d'intégration (Supertest + PostgreSQL éphémère via Testcontainers ; Docker doit tourner) |
| `npm run test:cov` | Tests unitaires avec couverture |

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).

Dans Docker, l'API reçoit `DATABASE_URL` et `MONGODB_URI` depuis `docker-compose.yml`. Pour la lancer hors Docker, voir la fin de `.env.example`.

## Tests d'intégration

Les fichiers `test/**/*.e2e-spec.ts` partagent une base PostgreSQL démarrée une seule fois par `test/support/base-de-test.global-setup.ts`. Son adresse arrive dans `process.env.DATABASE_URL`, comme en production. Les fichiers s'exécutent l'un après l'autre pour ne pas mélanger leurs données.
