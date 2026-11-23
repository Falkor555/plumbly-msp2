# 0002. Monorepo pour le front-end et le back-end

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Plumbly comporte un front-end React et une API NestJS. Chaque membre du binôme développe des fonctionnalités de bout en bout, front et back ensemble. Une même user story modifie donc souvent les deux parties en même temps.

## Décision

Le front-end et le back-end sont dans un seul dépôt GitHub, dans deux dossiers : `frontend/` et `backend/`. Le `docker-compose.yml` à la racine lance l'ensemble.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| Monorepo | Une issue = une branche = une PR, même pour une fonctionnalité front + back ; un seul kanban ; installation en une commande | Dépôt plus gros ; dépendances séparées à gérer dans chaque dossier |
| Deux dépôts | Séparation stricte | Deux PR par fonctionnalité, deux kanbans, versions à synchroniser |
| Monorepo avec outil dédié (Nx, Turborepo) | Cache de build, tâches partagées | Complexité inutile pour deux applications et deux semaines |

## Conséquences

- **Positives** : une pull request montre une fonctionnalité complète, ce qui facilite la relecture et la présentation à l'oral.
- **Négatives** : chaque dossier garde son propre `package.json` ; il faut lancer les commandes dans le bon dossier.
- **À faire** : créer la structure dans la card #7.
