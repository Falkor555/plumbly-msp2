# 0009. Docker Compose pour l'environnement de développement

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Plumbly a besoin de quatre services : front-end, API, PostgreSQL et MongoDB. Les deux membres du binôme doivent avoir exactement le même environnement, et la démonstration à l'oral se fait en local. Le déploiement en production relève du CCP 3 et n'est pas au périmètre.

## Décision

L'environnement de développement est décrit dans un `docker-compose.yml` à la racine. Une seule commande, `docker compose up`, lance les quatre services. Les variables sont dans un fichier `.env` non versionné, dont le modèle `.env.example` est versionné.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| Docker Compose | Mêmes versions de PostgreSQL et MongoDB pour tous ; installation en une commande ; réutilisé par Testcontainers | Docker Desktop à installer ; consommation mémoire |
| Installation locale des bases | Pas de Docker | Versions différentes selon les postes, installation longue sous Windows |
| Bases hébergées dans le cloud | Rien à installer | Dépendance à Internet, données partagées entre les deux développeurs |

## Conséquences

- **Positives** : « ça marche chez moi » devient « ça marche partout » ; la démonstration est reproductible.
- **Négatives** : le rechargement à chaud du code doit être configuré avec des volumes.
- **À faire** : créer le `docker-compose.yml` et le `.env.example` dans la card #7 ; ajouter MongoDB dans la card #27.
