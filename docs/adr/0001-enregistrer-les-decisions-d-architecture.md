# 0001. Enregistrer les décisions d'architecture avec des ADR

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Le projet est développé à deux, en deux semaines, et sera présenté à l'oral du titre CDA. Les choix techniques (stack, architecture, base de données, sécurité) doivent pouvoir être justifiés devant le jury, et chaque membre du binôme doit comprendre les décisions prises par l'autre.

## Décision

Chaque décision d'architecture importante est consignée dans un ADR, dans `docs/adr/`, au format Markdown et versionné avec le code. Le format suit le modèle de Michael Nygard, enrichi d'un tableau des alternatives.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| ADR dans le dépôt | Versionnés avec le code, relus en pull request, lisibles sur GitHub | Demande de la discipline |
| Section du cahier des charges | Un seul document | Le cahier des charges décrit le besoin, pas l'historique des choix |
| Discussions orales ou messagerie | Rapide | Rien ne reste, impossible à présenter au jury |

## Conséquences

- **Positives** : les choix sont justifiés par écrit et servent directement au dossier de projet et à l'oral (compétence « Définir l'architecture logicielle d'une application », CCP 2).
- **Négatives** : un peu de temps de rédaction à chaque décision.
- **À faire** : rédiger un ADR à chaque nouvelle décision structurante.
