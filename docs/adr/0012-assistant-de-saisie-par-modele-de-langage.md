# 0012. Assistant de saisie par modèle de langage

- **Statut** : Acceptée
- **Date** : 2026-11-25
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

La gestionnaire reçoit 15 à 30 demandes par jour, par téléphone ou par e-mail, et les saisit à la main dans l'écran de création d'intervention (US14 : type, urgence, durée estimée, description). Le texte de ces demandes contient déjà l'essentiel : symptôme, équipement, urgence ressentie. L'US30 (« Could », après les Must du MVP) demande de pré-remplir ces champs à partir de ce texte.

Contraintes :

- le modèle ne doit prendre aucune décision métier : les règles de planification (RG09 à RG11) et le cycle de vie des interventions restent appliqués par le code ;
- le texte libre peut contenir des données personnelles de clients (nom, téléphone, adresse), alors que leur classement n'en a pas besoin (RGPD, minimisation) ;
- l'écran de création et le module `interventions` appartiennent à Loïc : l'intégration doit le toucher le moins possible ;
- aucune nouvelle dépendance sans accord du binôme ; aucun secret dans le dépôt ;
- les tests ne doivent ni coûter ni dépendre d'un service externe.

## Décision

1. **Un module séparé `assistant`** expose une route unique `POST /api/v1/assistant/analyse-demande`, réservée aux rôles ADMIN et GEST, avec une limite de débit propre. Le corps contient `texte` (2 000 caractères au plus) et `clientId` facultatif.
2. **Le modèle propose, l'humain décide.** La route renvoie une suggestion (`typeInterventionId`, `urgence`, `dureeEstimeeMin`, `description`) que la gestionnaire modifie ou ignore ; l'intervention est toujours créée par `POST /interventions`, sur son clic. Le modèle n'a ni outil ni accès à la base.
3. **Minimisation avant l'envoi.** Le back retire du texte le nom, les téléphones, l'e-mail et les adresses connus du client désigné par `clientId`, puis remplace les motifs reconnaissables (téléphone, e-mail, numéro de rue) par `[TEL]`, `[EMAIL]`, `[ADRESSE]`. `clientId` n'est jamais transmis au modèle.
4. **Port et adaptateurs.** Le service dépend d'une classe abstraite `AnalyseurDeDemande`, sur le modèle de `JournalDesActions`. Deux implémentations : `AnalyseurClaude` (Claude Haiku 5.5, SDK officiel `@anthropic-ai/sdk`, sortie structurée par schéma JSON) et `AnalyseurDesactive`. La variable `IA_ACTIVEE` choisit l'implémentation ; elle vaut `false` par défaut.
5. **Double validation.** Le schéma JSON envoyé au modèle énumère les identifiants des types et les trois urgences ; le service vérifie ensuite que le type existe, que l'urgence vaut `NORMALE`, `PRIORITAIRE` ou `URGENTE`, que la durée est comprise entre 15 et 480 minutes et que la description ne dépasse pas 1 000 caractères. La réponse n'est exploitable que si son motif d'arrêt (`stop_reason`) vaut `end_turn` : un refus (`refusal`) ou une troncature (`max_tokens`) peut produire une sortie hors schéma. Toute valeur invalide, tout refus ou toute troncature fait rejeter la suggestion entière.
6. **Dégradation sans erreur.** Sans suggestion, la route renvoie 200 avec `{ "suggestion": null, "motif": ... }`, où `motif` vaut `IA_DESACTIVEE`, `INSUFFISANT` (texte trop vague) ou `INDISPONIBLE` (délai de 5 s dépassé, erreur de l'API, réponse rejetée). Une IA désactivée, un texte insuffisant ou une indisponibilité ne sont donc pas des erreurs applicatives pour le front, qui affiche un message selon le motif ; le formulaire reste utilisable à la main. Le client Anthropic est créé avec `maxRetries: 0` : sans cela, le SDK réessaie automatiquement une requête échouée et le délai réel peut dépasser largement les 5 s.
7. **Clé et coût.** `ANTHROPIC_API_KEY` n'existe que dans `backend/.env` (vide dans `.env.example`) ; le front n'appelle jamais Anthropic. Un plafond de dépense mensuel est fixé dans la console Anthropic.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| Pré-remplissage par un modèle hébergé, module séparé (retenue) | Gain direct pour la gestionnaire ; coût estimé à 0,12 $ par mois (30 demandes par jour) ; désactivable ; intégration front limitée à un bouton | Dépendance à un fournisseur externe et nouvelle dépendance npm ; données envoyées hors de l'application, à minimiser |
| Pas d'IA, saisie manuelle | Aucun risque, aucun coût, aucune dépendance | Ne répond pas à l'US30 et maintient la charge de saisie |
| Règles par mots-clés (« fuite » donne une urgence haute) | Local, gratuit, déterministe | Fragile sur du texte libre ; ne reformule pas la description |
| Suggestion de technicien et de créneau par le modèle | Automatisation apparente | Peut proposer un créneau qui viole RG09 ou RG10 ; un algorithme déterministe fait mieux, sans IA |
| Questions en langage naturel avec génération de SQL | Souplesse pour l'administrateur | Injection SQL, lecture de toutes les tables : contraire au §6.1 du cahier des charges |
| Modèle exécuté en local | Aucune donnée ne sort | Ressources importantes, image Docker lourde, qualité incertaine en français : hors de portée du MVP |
| Modèle plus puissant (Claude Sonnet 5.5) | Reformulation un peu meilleure | Environ 20 fois plus cher pour une classification courte que Haiku traite déjà |

## Conséquences

- **Positives** : saisie plus rapide sans changer le cycle de vie ni les règles de gestion ; l'IA reste isolée derrière un port, remplaçable et désactivable ; une injection de consigne dans le texte ne peut produire qu'une suggestion de formulaire, rejetée si elle est invalide ; les tests utilisent un faux `AnalyseurDeDemande` et n'appellent jamais l'API ; la route renvoie toujours un format de succès exploitable, sans route de configuration ni dépendance du front à l'état du fournisseur.
- **Négatives** : la minimisation réduit l'exposition des données personnelles mais n'anonymise pas le texte libre (un nom quelconque tapé dans le texte n'est pas détecté de façon fiable) ; la sortie structurée garantit le format de la réponse, pas son exactitude métier, d'où la validation côté service et la relecture humaine ; le fournisseur devient un sous-traitant au sens du RGPD et les données peuvent transiter hors de l'Union européenne selon la configuration et le contrat retenus (à vérifier) ; la conservation zéro (ZDR) est un accord à demander à Anthropic, pas le régime par défaut, et ne remplace pas la minimisation ; selon la documentation d'Anthropic, le premier appel avec un nouveau schéma de sortie structurée peut être plus lent (compilation du schéma, ensuite mis en cache), ce qui est à anticiper pendant la démonstration.
- **À faire** : client Anthropic avec `maxRetries: 0`, délai de 5 s et `max_tokens` bas, juste suffisant pour la réponse JSON ; vérifier `stop_reason` avant d'exploiter la réponse, sans journaliser le contenu d'un refus ; tests des cas refus, troncature, réponse invalide, IA désactivée et texte insuffisant ; ajouter US30 au cahier des charges et aux user stories ; accord du binôme sur la dépendance `@anthropic-ai/sdk` ; documenter la route et les motifs `IA_DESACTIVEE`, `INSUFFISANT` et `INDISPONIBLE` dans `docs/api.md` ; ajouter `ANTHROPIC_API_KEY` et `IA_ACTIVEE` à `.env.example` ; ajouter le fournisseur au registre des traitements et aux mentions légales ; étendre `ActionJournalisee` avec `SUGGESTION_IA` (utilisateur, date, résultat, jamais le texte), avec Loïc ; bouton « Pré-remplir » dans l'écran de création d'intervention (#18), avec Loïc ; évolution possible : savoir si la suggestion a été gardée, modifiée ou ignorée, ce qui demande un champ de plus dans `POST /interventions`.
