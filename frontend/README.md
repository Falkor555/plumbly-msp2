# Plumbly : front-end (React + Vite)

Application monopage de Plumbly (ADR 0004).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement sur http://localhost:5173 |
| `npm run build` | Vérifie les types puis construit dans `dist/` |
| `npm run preview` | Sert la version construite |

Les appels vers `/api` sont relayés par Vite vers l'API (`http://localhost:3000` par défaut, `http://backend:3000` dans Docker).

Le lint et le formatage se lancent à la racine du dépôt (`npm run lint`, `npm run format`).
