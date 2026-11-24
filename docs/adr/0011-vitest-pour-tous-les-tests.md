# 0011. Vitest pour tous les tests, front-end et back-end

- **Statut** : Acceptée
- **Date** : 2026-11-24
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL
- **Remplace** : [0008](0008-tests-unitaires-et-integration.md)

## Contexte

L'ADR 0008 prévoyait Jest pour le back-end, parce que NestJS l'installait par défaut. NestJS 12, utilisé depuis l'initialisation du monorepo (card #7), génère désormais un projet en modules ES (`"type": "module"`) configuré avec Vitest. Jest ne gère les modules ES qu'en mode expérimental de Node et demande un transformateur TypeScript en plus (`ts-jest` ou `@swc/jest`). Le front-end utilise déjà Vitest.

## Décision

- **Tests unitaires** : Vitest et `@nestjs/testing` pour les services, avec des repositories simulés ; Vitest et React Testing Library pour les composants front.
- **Tests d'intégration** : Vitest et Supertest sur l'API, avec une vraie base PostgreSQL éphémère lancée par **Testcontainers** (même image et même fuseau horaire que `docker-compose.yml`) ; MSW pour simuler l'API dans les tests front.
- Le reste de l'ADR 0008 est conservé : tests d'intégration écrits avant le développement à partir des user stories (card #12), lancés en local avant chaque pull request, pas de CI ni de tests end-to-end.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| Vitest partout | Un seul outil et une seule syntaxe dans le monorepo ; fonctionne tel que NestJS 12 le génère ; rapide | S'écarte de la documentation NestJS historique, encore écrite pour Jest |
| Jest pour le back-end (ADR 0008) | Outil le plus répandu dans les tutoriels NestJS | Configuration ESM expérimentale et transformateur à ajouter ; deux outils de test à maintenir |

## Conséquences

- **Positives** : `describe`, `it` et `expect` s'écrivent de la même façon des deux côtés ; aucune configuration à ajouter au projet généré.
- **Négatives** : les exemples NestJS trouvés en ligne utilisent souvent `jest.fn()`, à traduire en `vi.fn()`.
- **À faire** : ~~base MongoDB éphémère à ajouter au même endroit que PostgreSQL avec le journal des actions~~ (fait dans la card #27 : `mongo:8` démarré par le même `globalSetup`) ; migrations Prisma à appliquer dans le `globalSetup` des tests d'intégration (card #8).
