# 0006. MongoDB pour le journal des actions

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Le CCP 2 demande de développer des composants d'accès aux données **SQL et NoSQL**. Plumbly doit aussi garder la trace des actions sensibles et de l'historique des statuts des interventions (RG07, US19). Ces enregistrements sont nombreux, ne sont jamais modifiés après écriture et leur contenu varie selon l'action (un changement de statut ne contient pas les mêmes données qu'une création de compte).

## Décision

Le **journal des actions** est stocké dans **MongoDB**, dans une collection `journal_actions`. Chaque document contient : la date, l'utilisateur, le type d'action, l'entité concernée et les données avant / après. Sont journalisés : les changements de statut et les annulations d'interventions, les connexions (réussies et échouées) et les créations ou désactivations de comptes. Aucun mot de passe, jeton ou donnée personnelle complète n'est enregistré. Le module NestJS `journal` y accède par son propre repository, avec le **driver MongoDB natif** (paquet `mongodb`, sans Mongoose) : les requêtes NoSQL restent visibles dans le code.

MongoDB n'est pas la base métier : son indisponibilité ne bloque ni le démarrage de l'API (un avertissement suffit) ni une action métier (l'échec d'écriture est tracé dans les logs de l'API). Le journal est écrit après la validation de la transaction PostgreSQL, jamais dedans. La lecture de l'historique répond `503` tant que MongoDB est injoignable.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| MongoDB pour le journal | Documents de structure variable, écriture en ajout seul, cas d'usage NoSQL naturel et facile à justifier | Une base de plus à lancer et à sauvegarder |
| Table de journal dans PostgreSQL (JSONB) | Une seule base | Ne démontre pas la compétence NoSQL |
| Redis pour le cache des plannings | Rapide | Usage plus difficile à justifier fonctionnellement ; données éphémères |

## Conséquences

- **Positives** : couvre la partie NoSQL du CCP 2 avec un besoin réel ; le journal n'alourdit pas la base métier.
- **Négatives** : pas de jointure entre le journal et PostgreSQL ; l'identifiant de l'entité est copié dans chaque document.
- **À faire** :
  - [x] développer le module `journal` dans la card #27 (service MongoDB dans Docker Compose, repository, route d'historique) ; collection décrite dans le [modèle de données](../modele-donnees.md#8-données-nosql--journal-des-actions).

## Historique

- 2026-11-23 : écartée dans un premier temps (SQL uniquement), puis acceptée le même jour : le journal répond à un besoin de traçabilité (US19, RG07) et couvre l'accès aux données NoSQL.
