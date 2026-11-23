# 0010. Flux Git : `develop` par défaut et une seule fusion finale vers `main`

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Deux développeurs travaillent en parallèle sur des fonctionnalités différentes, suivies dans un GitHub Project. Chaque card du kanban devient une issue. Le projet doit aboutir à une version stable présentée au jury.

## Décision

- `develop` est la **branche par défaut** du dépôt : toutes les branches partent de `develop`.
- Une branche par issue, créée depuis l'issue avec « Create a branch » (exemple : `12-ecrire-tests-integration`).
- Fusion dans `develop` uniquement par pull request, après relecture de l'autre membre du binôme et tests passés en local ; `Closes #n` ferme l'issue.
- Une **seule fusion finale** de `develop` vers `main`, à la fin du projet : `main` contient la version présentée.
- Les branches fusionnées sont supprimées.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| `develop` par défaut + fusion finale vers `main` | `main` reste stable ; les issues se ferment automatiquement à la fusion dans `develop` | `main` n'évolue qu'une fois |
| GitHub Flow (tout sur `main`) | Plus simple | `main` contient du travail inachevé pendant le projet |
| Git Flow complet (release, hotfix) | Très structuré | Trop lourd pour deux semaines et deux personnes |

## Conséquences

- **Positives** : historique lisible, une PR par card, relecture croisée systématique ; démontre la compétence « Contribuer à la gestion d'un projet informatique » (CCP 1).
- **Négatives** : les conflits entre branches doivent être résolus régulièrement en récupérant `develop`.
- **À faire** : protéger `main` sur GitHub pour interdire les pushs directs.
