# Décisions d'architecture (ADR)

Ce dossier contient les ADR (*Architecture Decision Records*) de Plumbly. Un ADR est une courte fiche qui garde la trace d'une décision technique importante : son contexte, le choix fait, les alternatives écartées et ses conséquences.

## Index

| N° | Décision | Statut | Date |
| --- | --- | --- | --- |
| [0001](0001-enregistrer-les-decisions-d-architecture.md) | Enregistrer les décisions d'architecture avec des ADR | Acceptée | 2026-11-23 |
| [0002](0002-monorepo-front-back.md) | Monorepo pour le front-end et le back-end | Acceptée | 2026-11-23 |
| [0003](0003-api-nestjs-en-couches.md) | API REST NestJS organisée en couches | Acceptée | 2026-11-23 |
| [0004](0004-front-react-vite-tailwind.md) | Front-end React, Vite et Tailwind CSS | Acceptée | 2026-11-23 |
| [0005](0005-postgresql-prisma-et-sql-manuel.md) | PostgreSQL avec Prisma, et requêtes SQL écrites à la main | Acceptée | 2026-11-23 |
| [0006](0006-mongodb-pour-le-journal-des-actions.md) | MongoDB pour le journal des actions | Acceptée | 2026-11-23 |
| [0007](0007-authentification-jwt-et-argon2.md) | Authentification par JWT et hachage argon2 | Acceptée | 2026-11-23 |
| [0008](0008-tests-unitaires-et-integration.md) | Tests unitaires et d'intégration avec Testcontainers | Remplacée par 0011 | 2026-11-23 |
| [0009](0009-docker-compose-environnement-de-dev.md) | Docker Compose pour l'environnement de développement | Acceptée | 2026-11-23 |
| [0010](0010-flux-git-develop.md) | Flux Git : `develop` par défaut et une seule fusion finale vers `main` | Acceptée | 2026-11-23 |
| [0011](0011-vitest-pour-tous-les-tests.md) | Vitest pour tous les tests, front-end et back-end | Acceptée | 2026-11-24 |
| [0013](0013-signature-client-a-la-cloture.md) | Signature du client à la clôture d'une intervention | Proposée | 2026-11-25 |
| [0014](0014-import-export-csv.md) | Import et export CSV, sans dépendance, fichier envoyé en JSON | Proposée | 2026-11-25 |

## Rédiger un nouvel ADR

1. Copier [`modele.md`](modele.md) en `NNNN-titre-court.md`, avec le numéro suivant.
2. Remplir les sections, en restant court : une page au maximum.
3. Ajouter une ligne dans l'index ci-dessus.
4. Faire relire par l'autre membre du binôme dans la pull request.

Un ADR accepté n'est plus modifié. Si une décision change, on écrit un nouvel ADR qui la **remplace**, et on passe l'ancien au statut « Remplacée par NNNN ».

## Statuts possibles

- **Proposée** : en discussion, pas encore validée par le binôme.
- **Acceptée** : validée et appliquée.
- **Rejetée** : étudiée puis écartée.
- **Remplacée par NNNN** : remplacée par une décision plus récente.
