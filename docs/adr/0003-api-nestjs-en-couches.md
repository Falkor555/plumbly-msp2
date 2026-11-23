# 0003. API REST NestJS organisée en couches

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Le CCP 2 demande une application sécurisée **organisée en couches**. Plumbly contient de nombreuses règles de gestion (cycle de vie des statuts, conflits de planning, droits par rôle) qui doivent être testables indépendamment de HTTP et de la base de données.

## Décision

Le back-end est une API REST développée avec **NestJS** en TypeScript. Chaque module métier (auth, users, clients, technicians, interventions, tours, dashboard) est découpé en trois couches :

1. **Contrôleur** : routes HTTP, validation des DTO, guards d'authentification et de rôle.
2. **Service** : règles de gestion ; ne connaît ni HTTP ni SQL.
3. **Repository** : seul point d'accès aux données (Prisma ou SQL manuel).

L'API est versionnée (`/api/v1`) et documentée avec Swagger.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| NestJS en couches | Architecture imposée par le framework, injection de dépendances, guards, intégration native de Jest et Swagger | Courbe d'apprentissage (décorateurs, modules) |
| Express seul | Simple, très répandu | Aucune structure imposée : l'organisation en couches repose entièrement sur l'équipe |
| GraphQL | Requêtes flexibles côté front | Plus complexe à sécuriser et à tester ; inutile pour des écrans CRUD simples |

## Conséquences

- **Positives** : les services se testent avec des repositories simulés ; on peut changer de source de données sans toucher au métier ; l'architecture se montre facilement au jury.
- **Négatives** : plus de fichiers par fonctionnalité (contrôleur, service, repository, DTO).
- **À faire** : initialiser le projet et un premier module exemple dans la card #8.
