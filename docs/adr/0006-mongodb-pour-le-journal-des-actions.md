# 0006. MongoDB pour le journal des actions

- **Statut** : Rejetée (pour cette version)
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Le CCP 2 demande de développer des composants d'accès aux données **SQL et NoSQL**. Plumbly doit aussi garder la trace des actions sensibles et de l'historique des statuts des interventions (RG07, US19). Ces enregistrements sont nombreux, ne sont jamais modifiés après écriture et leur contenu varie selon l'action (un changement de statut ne contient pas les mêmes données qu'une création de compte).

## Décision

Le **journal des actions** est stocké dans **MongoDB**, dans une collection `journal_actions`. Chaque document contient : la date, l'utilisateur, le type d'action, l'entité concernée et les données avant / après. Le module NestJS `audit-log` y accède par son propre repository.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| MongoDB pour le journal | Documents de structure variable, écriture en ajout seul, cas d'usage NoSQL naturel et facile à justifier | Une base de plus à lancer et à sauvegarder |
| Table de journal dans PostgreSQL (JSONB) | Une seule base | Ne démontre pas la compétence NoSQL |
| Redis pour le cache des plannings | Rapide | Usage plus difficile à justifier fonctionnellement ; données éphémères |

## Conséquences

- **Positives** : couvre la partie NoSQL du CCP 2 avec un besoin réel ; le journal n'alourdit pas la base métier.
- **Négatives** : pas de jointure entre le journal et PostgreSQL ; l'identifiant de l'entité est copié dans chaque document.
- **À faire** : aucun pour l'instant.

## Décision finale

Le 23 novembre 2026, le binôme a décidé de ne pas développer de journal des actions dans cette version. US19 et RG07 sont reportées, et la card #27 est fermée. La compétence d'accès aux données du CCP 2 se valide avec SQL ou NoSQL : le binôme a retenu SQL (ADR 0005), Plumbly n'utilise donc pas de base NoSQL.
