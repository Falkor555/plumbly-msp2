# 0005. PostgreSQL avec Prisma, et requêtes SQL écrites à la main

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Les données de Plumbly sont fortement liées : clients, adresses, techniciens, tournées, interventions. Plusieurs règles de gestion reposent sur des contraintes d'intégrité (une tournée par technicien et par jour, ordre unique dans une tournée). Le CCP 2 demande de concevoir une base relationnelle et de développer des composants d'accès aux données, en SQL **ou** en NoSQL au choix. Le binôme veut aussi montrer sa maîtrise du SQL dans le dossier.

## Décision

- Accès aux données en **SQL** uniquement : Plumbly n'utilise pas de base NoSQL.
- Base relationnelle **PostgreSQL**.
- Accès courant aux données avec l'ORM **Prisma** : schéma déclaratif, migrations versionnées, client typé.
- Quelques requêtes **écrites à la main en SQL**, avec `$queryRaw` et `$executeRaw` de Prisma et des paramètres liés : reporting, jointures, agrégations et une transaction de réordonnancement de tournée.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| PostgreSQL + Prisma + SQL manuel | Contraintes d'intégrité fortes, énumérations, transactions ; Prisma accélère le CRUD ; le SQL manuel montre la maîtrise des requêtes | Deux façons d'accéder aux données à documenter |
| Base NoSQL (MongoDB) | Schéma souple, documents imbriqués | Données fortement liées (client → adresse → intervention → tournée) mal adaptées aux documents ; contraintes d'intégrité et transactions à gérer dans le code |
| MySQL / MariaDB | Très répandu | Moins de fonctionnalités avancées (énumérations natives, types de dates, contraintes) |
| TypeORM | Intégration NestJS historique | Typage moins fiable, migrations plus fragiles |
| SQL uniquement (pg) | Contrôle total | Beaucoup de code répétitif pour le CRUD, pas de typage automatique |

## Conséquences

- **Positives** : les règles d'intégrité sont garanties par la base ; le schéma Prisma sert de MLD versionné ; les requêtes manuelles alimentent le dossier de projet.
- **Négatives** : le SQL manuel n'est pas typé par Prisma ; il doit être couvert par des tests d'intégration.
- **Sécurité** : jamais de concaténation de chaînes dans une requête ; uniquement des requêtes paramétrées.
- **À faire** : schéma Prisma (card #8), requêtes manuelles (card #21).
