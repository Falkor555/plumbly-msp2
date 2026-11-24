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
| Unitaires | [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) | [Jest](https://jestjs.io/) (intégré par défaut à NestJS) |
| Intégration | Vitest + [MSW](https://mswjs.io/) (simulation de l'API) | Jest + [Supertest](https://github.com/ladjs/supertest) + [Testcontainers](https://testcontainers.com/) (PostgreSQL réel dans Docker) |

**Pourquoi ces choix :**

- **Vitest** reprend la configuration de Vite, s'exécute très vite et garde une API compatible avec Jest.
- **React Testing Library** teste les composants comme l'utilisateur s'en sert (textes, boutons, formulaires), pas leurs détails d'implémentation.
- **MSW** intercepte les appels réseau, ce qui permet de tester le front sans lancer le back-end.
- **Jest** est déjà configuré dans tout projet NestJS. Il fonctionne avec le module de test de Nest (`@nestjs/testing`).
- **Supertest** envoie de vraies requêtes HTTP à l'application NestJS pour vérifier les routes de bout en bout côté API.
- **Testcontainers** lance une vraie base PostgreSQL éphémère pendant les tests d'intégration. On teste donc sur le même moteur que l'application, et non sur une base simulée.

## Structure du projet

> Structure proposée, à ajuster selon l'organisation retenue.

```
plumbly-msp2/
├── frontend/            # Application React (Vite + Tailwind)
├── backend/             # API NestJS
│   └── prisma/          # Schéma Prisma et migrations
├── docker-compose.yml   # Orchestration des services (front, back, PostgreSQL)
└── README.md
```

## Installation et lancement

### Prérequis

- [Docker](https://www.docker.com/) et Docker Compose
- [Node.js](https://nodejs.org/) (version LTS) pour le développement hors conteneur

### Démarrage avec Docker

```bash
git clone https://github.com/Falkor555/plumbly-msp2.git
cd plumbly-msp2
cp .env.example .env   # puis renseigner les variables
docker compose up -d
```

L'application sera alors accessible sur :

- Front-end : http://localhost:5173 *(à confirmer)*
- API : http://localhost:3000 *(à confirmer)*

### Lancer les tests

```bash
# Back-end
cd backend
npm run test        # tests unitaires
npm run test:e2e    # tests d'intégration

# Front-end
cd frontend
npm run test
```

## Auteurs

- **Loïc BOTSY**
- **Arnaud BIDEL**

## Licence

Projet réalisé dans le cadre de la formation CDA9, tous droits réservés.
