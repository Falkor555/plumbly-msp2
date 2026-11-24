# Plumbly : API (NestJS)

API REST de Plumbly, organisée en couches (ADR 0003). Toutes les routes sont préfixées par `/api/v1`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run start:dev` | Lance l'API avec rechargement à chaud (port 3000) |
| `npm run build` | Compile dans `dist/` |
| `npm run test` | Tests unitaires |
| `npm run test:e2e` | Tests d'intégration |

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).

Dans Docker, l'API reçoit `DATABASE_URL` et `MONGODB_URI` depuis `docker-compose.yml`. Pour la lancer hors Docker, voir la fin de `.env.example`.
