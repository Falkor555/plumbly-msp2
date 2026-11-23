# 0008. Tests unitaires et d'intégration avec Testcontainers

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Les règles de gestion (statuts, conflits de planning, droits) sont le cœur de Plumbly et doivent être vérifiées automatiquement. Le CCP 1 attend des composants métier testés. Le plan de tests formel, la recette et la CI/CD relèvent du CCP 3, qui n'est pas présenté.

## Décision

- **Tests unitaires** : Jest et `@nestjs/testing` pour les services, avec des repositories simulés ; Vitest et React Testing Library pour les composants front.
- **Tests d'intégration** : Jest et Supertest sur l'API, avec une vraie base PostgreSQL éphémère lancée par **Testcontainers** ; MSW pour simuler l'API dans les tests front.
- Les tests d'intégration sont écrits **avant** le développement, à partir des user stories (card #12).
- Les tests sont lancés en local avant chaque pull request ; pas de CI, ni de tests end-to-end, ni de plan de tests formel.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| Testcontainers (PostgreSQL réel) | Teste le même moteur que l'application, y compris les contraintes et le SQL manuel | Nécessite Docker ; tests plus lents |
| Base SQLite en mémoire | Rapide | Comportement différent de PostgreSQL ; SQL manuel non testable |
| Base de test partagée | Simple | Tests dépendants les uns des autres, données polluées |
| Tests end-to-end (Playwright) | Parcours complets dans un navigateur | Relève du CCP 3 ; coûteux à maintenir en deux semaines |

## Conséquences

- **Positives** : les règles de gestion et les contrôles d'accès sont prouvés par des tests, utilisables comme démonstration à l'oral.
- **Négatives** : Docker doit tourner pour lancer les tests d'intégration ; sans CI, la discipline de lancer les tests repose sur le binôme.
- **À faire** : environnement de test (card #11), tests d'intégration (card #12), tests unitaires (card #22).
