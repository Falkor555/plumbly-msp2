# Plumbly

**Plumbly** est un progiciel de gestion des tournées de plombiers. Il permet aux entreprises de plomberie de planifier les interventions et de les répartir entre les techniciens. Il sert aussi à suivre leur réalisation au quotidien.

## Pourquoi Plumbly ?

Organiser les journées d'une équipe de plombiers est souvent fastidieux. Les demandes arrivent en continu, les urgences bousculent le planning, les déplacements coûtent du temps, et le suivi se fait encore souvent sur papier ou dans un tableur.

Plumbly centralise ces informations dans un outil unique :

- **pour le gestionnaire** : une vue claire du planning, des interventions à affecter et de la charge de chaque technicien ;
- **pour le plombier** : la liste de ses interventions du jour, dans l'ordre de la tournée, avec les informations utiles (client, adresse, nature du problème) ;
- **pour l'entreprise** : moins de temps perdu, moins d'oublis et un historique des interventions.

## Fonctionnalités envisagées

> Liste indicative, susceptible d'évoluer au fil du développement.

- Gestion des clients et de leurs adresses d'intervention
- Création et suivi des interventions (statut : à planifier, planifiée, en cours, terminée)
- Gestion des techniciens et de leurs disponibilités
- Planification des tournées et affectation des interventions
- Vue planning (jour / semaine) par technicien
- Authentification et rôles (gestionnaire, technicien)

## Stack technique

| Couche | Technologies |
| --- | --- |
| Front-end | [React](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/) |
| Back-end | [NestJS](https://nestjs.com/) (Node.js, TypeScript) |
| Base de données | [PostgreSQL](https://www.postgresql.org/) |
| Accès aux données | [Prisma](https://www.prisma.io/) (ORM) + requêtes SQL écrites à la main |
| Journal des actions | [MongoDB](https://www.mongodb.com/) (base NoSQL) |
| Conteneurisation | [Docker](https://www.docker.com/) / Docker Compose |

### Accès aux données

L'essentiel de l'accès à la base passe par **Prisma** :

- le schéma des données est défini dans `schema.prisma` ;
- les migrations sont générées et versionnées avec `prisma migrate` ;
- le client Prisma, typé en TypeScript, sert pour les opérations courantes (CRUD).

Certaines requêtes sont toutefois **écrites directement en SQL**, avec `$queryRaw` et `$executeRaw` de Prisma. Cela concerne par exemple les jointures complexes, les agrégations et les requêtes de reporting. Ce choix permet de garder la main sur les requêtes les plus importantes et de montrer la maîtrise du SQL.

## Tests

| Type de test | Front-end | Back-end |
| --- | --- | --- |
| Unitaires | [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) | Vitest (configuré par défaut par NestJS 12) |
| Intégration | Vitest + [MSW](https://mswjs.io/) (simulation de l'API) | Vitest + [Supertest](https://github.com/ladjs/supertest) + [Testcontainers](https://testcontainers.com/) (PostgreSQL réel dans Docker) |

**Pourquoi ces choix :**

- **Vitest** reprend la configuration de Vite, s'exécute très vite et sert des deux côtés : une seule syntaxe de test dans tout le dépôt (ADR 0011).
- **React Testing Library** teste les composants comme l'utilisateur s'en sert (textes, boutons, formulaires), pas leurs détails d'implémentation.
- **MSW** intercepte les appels réseau, ce qui permet de tester le front sans lancer le back-end.
- **`@nestjs/testing`** construit un module Nest de test, où l'on remplace les repositories par des simulations.
- **Supertest** envoie de vraies requêtes HTTP à l'application NestJS pour vérifier les routes de bout en bout côté API.
- **Testcontainers** lance une vraie base PostgreSQL éphémère pendant les tests d'intégration. On teste donc sur le même moteur que l'application, et non sur une base simulée.

## Structure du projet

```
plumbly-msp2/
├── frontend/            # Application React (Vite) : voir frontend/README.md
├── backend/             # API NestJS : voir backend/README.md
├── docs/                # Cahier des charges, ADR, modèle de données
├── docker-compose.yml   # Front, API, PostgreSQL et MongoDB pour le développement
├── .env.example         # Modèle des variables d'environnement (copier en .env)
├── eslint.config.mjs    # Configuration ESLint commune au front et au back
├── .prettierrc.json     # Configuration Prettier commune
└── package.json         # Outillage commun (lint, formatage)
```

## Installation et lancement

### Prérequis

- [Docker Desktop](https://www.docker.com/) (avec WSL2 sous Windows) et Docker Compose
- [Node.js](https://nodejs.org/) 24 LTS (version indiquée dans `.nvmrc`), pour le lint et le développement hors conteneur

### Démarrage avec Docker

```bash
git clone https://github.com/Falkor555/plumbly-msp2.git
cd plumbly-msp2
cp .env.example .env   # PowerShell : Copy-Item .env.example .env, puis remplacer les « a-changer »
docker compose up --build
```

| Service | Adresse | Rôle |
| --- | --- | --- |
| Front-end | http://localhost:5173 | Application React ; `/api` est relayé vers l'API |
| API | http://localhost:3000/api/v1 | API NestJS |
| PostgreSQL | `localhost:5432` | Données métier |
| MongoDB | `localhost:27017` | Journal des actions |

Les ports sont réglables dans `.env` si l'un d'eux est déjà occupé sur le poste. Les services sont réglés sur le fuseau horaire `Indian/Reunion` (variable `TZ`). Le code de `frontend/` et `backend/` est monté dans les conteneurs : une modification est rechargée à chaud.

Arrêt : `docker compose down` (ajouter `-v` pour effacer aussi les données des bases).

### Lint et formatage

À la racine du dépôt, après un `npm install` :

```bash
npm run lint           # ESLint sur frontend/ et backend/
npm run format:check   # vérifie la mise en forme Prettier
npm run format         # applique la mise en forme
```

### Lancer les tests

Une fois les dépendances installées (`npm install` à la racine, dans `backend/` et dans `frontend/`), depuis la racine du dépôt :

```bash
npm run test        # tests unitaires du back-end puis du front-end
npm run test:e2e    # tests d'intégration de l'API (Docker doit tourner)
```

Chaque dossier a aussi ses propres scripts (`npm run test`, `npm run test:watch`, `npm run test:cov` dans `backend/`).

Les tests d'intégration démarrent eux-mêmes une base PostgreSQL 17 jetable avec Testcontainers : Docker Desktop doit être lancé, mais `docker compose up` n'est pas nécessaire. Le premier lancement télécharge l'image, les suivants prennent une dizaine de secondes.

## Auteurs

- **Loïc BOTSY**
- **Arnaud BIDEL**

## Licence

Projet réalisé dans le cadre de la formation CDA9, tous droits réservés.
