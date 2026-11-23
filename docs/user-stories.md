# User stories — Plumbly

Ce document détaille les 29 user stories de Plumbly, regroupées en 6 epics. Chacune suit le format « En tant que…, je veux…, afin de… », porte une priorité MoSCoW et des critères d'acceptation au format « Étant donné / Quand / Alors ». Les acteurs sont décrits dans les [personas](personas.md) et les règles de gestion (RG) dans le [cahier des charges](cahier-des-charges.md#5-règles-de-gestion).

## Priorisation MoSCoW

| Priorité | Signification | Nombre |
| --- | --- | --- |
| **M** — Must | Indispensable au MVP, livré en semaine 2 | 19 |
| **S** — Should | Important, livré si le temps le permet | 6 |
| **C** — Could | Confort, prévu pour une version suivante | 3 |
| **W** — Won't | Reporté à une version suivante | 1 |

## Vue d'ensemble

| ID | Epic | User story (résumé) | Acteur | Priorité | Card |
| --- | --- | --- | --- | --- | --- |
| US01 | Comptes | Se connecter | Tous | M | #13, #14 |
| US02 | Comptes | Se déconnecter | Tous | M | #13, #14 |
| US03 | Comptes | Gérer les comptes utilisateurs | Administrateur | M | #13 |
| US04 | Comptes | Réinitialiser son mot de passe | Tous | S | #13, #14 |
| US05 | Comptes | Modifier son profil | Tous | C | — |
| US06 | Clients | Créer un client | Gestionnaire | M | #15, #16 |
| US07 | Clients | Gérer les adresses d'un client | Gestionnaire | M | #15, #16 |
| US08 | Clients | Rechercher un client | Gestionnaire | M | #15, #16 |
| US09 | Clients | Voir l'historique d'un client | Gestionnaire | S | #15, #16 |
| US10 | Clients | Modifier ou archiver un client | Gestionnaire | M | #15, #16 |
| US11 | Techniciens | Créer une fiche technicien | Gestionnaire | M | #15, #16 |
| US12 | Techniciens | Saisir des indisponibilités | Gestionnaire | M | #15, #16 |
| US13 | Techniciens | Renseigner les compétences | Gestionnaire | C | — |
| US14 | Interventions | Créer une intervention | Gestionnaire | M | #17, #18 |
| US15 | Interventions | Filtrer les interventions | Gestionnaire | M | #17, #18 |
| US16 | Interventions | Modifier ou annuler une intervention | Gestionnaire | M | #17, #18 |
| US17 | Interventions | Changer le statut sur le terrain | Technicien | M | #17, #18 |
| US18 | Interventions | Rédiger un compte rendu | Technicien | S | #17, #18 |
| US19 | Interventions | Consulter l'historique des statuts | Gestionnaire | W | — |
| US20 | Tournées | Créer une tournée | Gestionnaire | M | #19, #20 |
| US21 | Tournées | Affecter une intervention | Gestionnaire | M | #19, #20 |
| US22 | Tournées | Réordonner une tournée | Gestionnaire | M | #19, #20 |
| US23 | Tournées | Voir le planning jour / semaine | Gestionnaire | M | #19, #20 |
| US24 | Tournées | Voir sa tournée du jour | Technicien | M | #19, #20 |
| US25 | Tournées | Insérer une urgence | Gestionnaire | S | #19, #20 |
| US26 | Tableau de bord | Interventions par statut et technicien | Administrateur | M | #21 |
| US27 | Tableau de bord | Délai moyen de traitement | Administrateur | S | #21 |
| US28 | Tableau de bord | Interventions en retard | Gestionnaire | S | #21 |
| US29 | Tableau de bord | Export CSV | Administrateur | C | — |

---

## Epic 1 — Authentification et comptes

### US01 — Se connecter · Must

**En tant qu'**utilisateur, **je veux** me connecter avec mon e-mail et mon mot de passe **afin d'**accéder à mon espace.

- **Étant donné** un compte actif, **quand** je saisis un e-mail et un mot de passe corrects, **alors** j'arrive sur mon écran d'accueil : tableau de bord pour l'administrateur et le gestionnaire, « Ma tournée du jour » pour le technicien.
- **Étant donné** des identifiants incorrects, **quand** je valide, **alors** un message générique s'affiche (« E-mail ou mot de passe incorrect »), sans préciser lequel est faux.
- **Étant donné** 5 échecs en moins de 15 minutes, **quand** je réessaie, **alors** la connexion est temporairement bloquée.
- **Étant donné** un compte désactivé, **quand** je saisis les bons identifiants, **alors** la connexion est refusée.

### US02 — Se déconnecter · Must

**En tant qu'**utilisateur, **je veux** me déconnecter **afin de** sécuriser ma session.

- **Étant donné** que je suis connecté, **quand** je clique sur « Se déconnecter », **alors** mes jetons sont invalidés et je reviens à la page de connexion.
- **Étant donné** que je suis déconnecté, **quand** j'utilise le bouton « Précédent » du navigateur, **alors** je n'accède à aucune page protégée.

### US03 — Gérer les comptes utilisateurs · Must

**En tant qu'**administrateur, **je veux** créer, modifier et désactiver des comptes **afin de** contrôler l'accès à l'application.

- **Étant donné** un formulaire rempli (nom, prénom, e-mail, rôle), **quand** je le valide, **alors** le compte est créé avec un mot de passe provisoire à changer à la première connexion.
- **Étant donné** un e-mail déjà utilisé, **quand** je crée le compte, **alors** un message indique que l'e-mail existe déjà (RG19).
- **Étant donné** un compte actif, **quand** je le désactive, **alors** l'utilisateur ne peut plus se connecter mais ses données restent dans l'historique.
- **Étant donné** que je suis gestionnaire ou technicien, **quand** j'essaie d'accéder à la gestion des comptes, **alors** l'accès est refusé.

### US04 — Réinitialiser son mot de passe · Should

**En tant qu'**utilisateur, **je veux** réinitialiser mon mot de passe **afin de** retrouver l'accès à mon compte.

- **Étant donné** mon e-mail saisi sur « Mot de passe oublié », **quand** je valide, **alors** un message neutre s'affiche, que l'e-mail existe ou non.
- **Étant donné** le lien reçu, **quand** je l'ouvre dans les 30 minutes, **alors** je peux choisir un nouveau mot de passe conforme à la politique de sécurité.
- **Étant donné** un lien déjà utilisé ou expiré, **quand** je l'ouvre, **alors** il est refusé.

### US05 — Modifier son profil · Could

**En tant qu'**utilisateur, **je veux** consulter et modifier mes informations **afin de** les garder à jour.

- **Étant donné** ma page profil, **quand** je modifie mon nom ou mon téléphone, **alors** les changements sont enregistrés.
- **Étant donné** que je change mon mot de passe, **quand** je valide, **alors** l'ancien mot de passe m'est demandé.

---

## Epic 2 — Clients

### US06 — Créer un client · Must

**En tant que** gestionnaire, **je veux** créer un client avec ses coordonnées **afin de** l'associer à des interventions.

- **Étant donné** un formulaire avec type (particulier ou professionnel), nom, téléphone et une adresse, **quand** je le valide, **alors** le client est créé.
- **Étant donné** un nom ou un téléphone manquant, **quand** je valide, **alors** le champ concerné est signalé et rien n'est enregistré.
- **Étant donné** un e-mail mal formé, **quand** je valide, **alors** un message indique le format attendu.

### US07 — Gérer les adresses d'un client · Must

**En tant que** gestionnaire, **je veux** ajouter plusieurs adresses d'intervention à un client **afin de** gérer ses différents logements.

- **Étant donné** la fiche d'un client, **quand** j'ajoute une adresse (rue, code postal, ville, informations d'accès), **alors** elle apparaît dans sa liste d'adresses.
- **Étant donné** un client avec une seule adresse, **quand** j'essaie de la supprimer, **alors** la suppression est refusée (RG17).

### US08 — Rechercher un client · Must

**En tant que** gestionnaire, **je veux** rechercher un client par nom, téléphone ou ville **afin de** le retrouver pendant un appel.

- **Étant donné** la liste des clients, **quand** je tape au moins 2 caractères, **alors** les résultats se filtrent, sans tenir compte des majuscules ni des accents.
- **Étant donné** plus de 20 résultats, **quand** la liste s'affiche, **alors** elle est paginée.
- **Étant donné** une saisie contenant des caractères spéciaux (`' OR 1=1 --`), **quand** je recherche, **alors** aucune erreur ni résultat inattendu n'apparaît.

### US09 — Voir l'historique d'un client · Should

**En tant que** gestionnaire, **je veux** consulter l'historique des interventions d'un client **afin de** connaître ses antécédents.

- **Étant donné** la fiche d'un client, **quand** j'ouvre l'onglet « Historique », **alors** ses interventions s'affichent de la plus récente à la plus ancienne, avec date, type, statut et technicien.

### US10 — Modifier ou archiver un client · Must

**En tant que** gestionnaire, **je veux** modifier ou archiver un client **afin de** garder une base à jour.

- **Étant donné** la fiche d'un client, **quand** je modifie ses coordonnées, **alors** les changements sont enregistrés.
- **Étant donné** un client lié à des interventions, **quand** je l'archive après confirmation, **alors** il disparaît des listes et des recherches mais reste visible dans l'historique (RG18).

---

## Epic 3 — Techniciens

### US11 — Créer une fiche technicien · Must

**En tant que** gestionnaire, **je veux** créer une fiche technicien liée à un compte **afin de** lui affecter des interventions.

- **Étant donné** un compte de rôle technicien, **quand** je crée sa fiche (téléphone, couleur de planning), **alors** il apparaît dans la liste des techniciens et dans le planning.
- **Étant donné** un compte qui n'a pas le rôle technicien, **quand** je tente de lui créer une fiche, **alors** c'est refusé.

### US12 — Saisir des indisponibilités · Must

**En tant que** gestionnaire, **je veux** saisir les indisponibilités d'un technicien **afin de** ne pas le planifier à tort.

- **Étant donné** la fiche d'un technicien, **quand** j'ajoute une période (début, fin, motif), **alors** elle apparaît grisée dans le planning.
- **Étant donné** une date de fin antérieure à la date de début, **quand** je valide, **alors** un message d'erreur s'affiche.
- **Étant donné** une indisponibilité, **quand** j'essaie d'affecter une intervention sur cette période, **alors** l'affectation est refusée (RG10).

### US13 — Renseigner les compétences · Could

**En tant que** gestionnaire, **je veux** renseigner les compétences d'un technicien **afin de** choisir le bon profil.

- **Étant donné** une liste de compétences (sanitaire, chauffage, débouchage…), **quand** je les associe à un technicien, **alors** je peux filtrer les techniciens par compétence lors d'une affectation.

---

## Epic 4 — Interventions

### US14 — Créer une intervention · Must

**En tant que** gestionnaire, **je veux** créer une intervention **afin d'**enregistrer la demande d'un client.

- **Étant donné** un client et une de ses adresses, un type, une description, un niveau d'urgence et une durée estimée, **quand** je valide, **alors** l'intervention est créée au statut « à planifier » (RG01).
- **Étant donné** un type d'intervention choisi, **quand** le formulaire s'affiche, **alors** la durée estimée est préremplie avec la durée par défaut du type.
- **Étant donné** une urgence « urgente », **quand** l'intervention est créée, **alors** elle apparaît en tête de la liste « à planifier » (RG15).

### US15 — Filtrer les interventions · Must

**En tant que** gestionnaire, **je veux** filtrer les interventions par statut, urgence, technicien et date **afin de** prioriser mon travail.

- **Étant donné** la liste des interventions, **quand** je combine plusieurs filtres, **alors** seules les interventions correspondant à tous les filtres s'affichent.
- **Étant donné** des filtres actifs, **quand** je recharge la page, **alors** ils sont conservés.

### US16 — Modifier ou annuler une intervention · Must

**En tant que** gestionnaire, **je veux** modifier ou annuler une intervention **afin de** suivre les changements demandés par le client.

- **Étant donné** une intervention non terminée, **quand** je modifie sa description, son urgence ou sa durée, **alors** les changements sont enregistrés.
- **Étant donné** une intervention non terminée, **quand** je l'annule en saisissant un motif, **alors** elle passe au statut « annulée » (RG05).
- **Étant donné** une annulation sans motif, **quand** je valide, **alors** elle est refusée.
- **Étant donné** une intervention « terminée » ou « annulée », **quand** j'essaie de la modifier, **alors** c'est refusé (RG06).

### US17 — Changer le statut sur le terrain · Must

**En tant que** technicien, **je veux** passer une intervention à « en cours » puis à « terminée » **afin d'**informer le gestionnaire sans téléphoner.

- **Étant donné** une intervention « planifiée » qui m'est affectée, **quand** j'appuie sur « Démarrer », **alors** elle passe à « en cours ».
- **Étant donné** une intervention « en cours » qui m'est affectée, **quand** j'appuie sur « Terminer », **alors** elle passe à « terminée » avec l'heure de fin.
- **Étant donné** une intervention affectée à un collègue, **quand** j'essaie de changer son statut, **alors** c'est refusé (RG03).
- **Étant donné** une intervention « à planifier », **quand** j'essaie de la passer directement à « terminée », **alors** la transition est refusée.

### US18 — Rédiger un compte rendu · Should

**En tant que** technicien, **je veux** ajouter un compte rendu à une intervention terminée **afin de** tracer ce qui a été fait.

- **Étant donné** une intervention que je viens de terminer, **quand** je saisis un compte rendu, **alors** il est enregistré et visible par le gestionnaire.
- **Étant donné** un texte de plus de 2 000 caractères, **quand** je valide, **alors** un message indique la limite.

### US19 — Consulter l'historique des statuts · Won't (reportée)

**En tant que** gestionnaire, **je veux** voir l'historique des changements de statut d'une intervention **afin de** savoir qui a fait quoi et quand.

> Reportée : le journal des actions n'est pas prévu dans cette version. Les critères ci-dessous servent de référence pour une version suivante.

- **Étant donné** la fiche d'une intervention, **quand** j'ouvre l'historique, **alors** chaque changement apparaît avec la date, l'auteur, l'ancien et le nouveau statut (RG07).

---

## Epic 5 — Tournées et planning

### US20 — Créer une tournée · Must

**En tant que** gestionnaire, **je veux** créer la tournée d'un technicien pour une date **afin d'**organiser sa journée.

- **Étant donné** un technicien et une date future, **quand** je crée la tournée, **alors** elle apparaît vide dans le planning.
- **Étant donné** un technicien qui a déjà une tournée ce jour-là, **quand** je crée une tournée, **alors** c'est refusé (RG08).
- **Étant donné** une date passée, **quand** je crée une tournée, **alors** c'est refusé (RG12).

### US21 — Affecter une intervention · Must

**En tant que** gestionnaire, **je veux** affecter une intervention à une tournée sur un créneau **afin de** la planifier.

- **Étant donné** une intervention « à planifier » et un créneau libre, **quand** je l'affecte, **alors** elle passe à « planifiée » (RG02) et apparaît dans la tournée.
- **Étant donné** un créneau qui chevauche une autre intervention du technicien, **quand** je l'affecte, **alors** l'affectation est refusée avec un message indiquant le conflit (RG09).
- **Étant donné** un créneau hors des horaires d'ouverture, **quand** je l'affecte, **alors** c'est refusé (RG11).
- **Étant donné** une intervention planifiée, **quand** je la retire de la tournée, **alors** elle revient à « à planifier » (RG04).

### US22 — Réordonner une tournée · Must

**En tant que** gestionnaire, **je veux** réordonner les interventions d'une tournée **afin d'**optimiser les trajets.

- **Étant donné** une tournée de plusieurs interventions, **quand** je change leur ordre, **alors** le nouvel ordre est enregistré (RG13) et visible immédiatement par le technicien.

### US23 — Voir le planning jour / semaine · Must

**En tant que** gestionnaire, **je veux** voir le planning de tous les techniciens par jour et par semaine **afin de** repérer les créneaux libres.

- **Étant donné** la vue jour, **quand** elle s'affiche, **alors** chaque technicien a une ligne avec ses interventions placées sur leurs créneaux et ses indisponibilités grisées.
- **Étant donné** la vue semaine, **quand** je filtre sur un technicien, **alors** seules ses tournées s'affichent.
- **Étant donné** une intervention du planning, **quand** je clique dessus, **alors** son détail s'ouvre.

### US24 — Voir sa tournée du jour · Must

**En tant que** technicien, **je veux** voir ma tournée du jour sur mon téléphone **afin de** savoir où aller.

- **Étant donné** que je me connecte, **quand** l'écran d'accueil s'affiche, **alors** je vois mes interventions du jour dans l'ordre, avec horaire, client, adresse et nature du problème.
- **Étant donné** une adresse, **quand** je l'appuie, **alors** mon application de navigation s'ouvre.
- **Étant donné** un numéro de téléphone, **quand** je l'appuie, **alors** l'appel se lance.
- **Étant donné** que je n'ai aucune intervention ce jour-là, **quand** l'écran s'affiche, **alors** un message l'indique clairement.

### US25 — Insérer une urgence · Should

**En tant que** gestionnaire, **je veux** insérer une urgence dans une tournée déjà planifiée **afin de** réagir rapidement.

- **Étant donné** une intervention urgente et une tournée en cours, **quand** je l'insère à une position, **alors** les interventions suivantes sont décalées et signalées comme modifiées.
- **Étant donné** que le décalage dépasse 19 h 00, **quand** je valide, **alors** un avertissement indique les interventions concernées.

---

## Epic 6 — Tableau de bord

### US26 — Interventions par statut et par technicien · Must

**En tant qu'**administrateur, **je veux** voir le nombre d'interventions par statut et par technicien sur une période **afin de** suivre l'activité.

- **Étant donné** une période choisie, **quand** le tableau de bord s'affiche, **alors** il présente les totaux par statut et par technicien.
- **Étant donné** le jeu de données de test, **quand** je compare les totaux, **alors** ils correspondent aux données (requête SQL écrite à la main, card #21).

### US27 — Délai moyen de traitement · Should

**En tant qu'**administrateur, **je veux** connaître le délai moyen entre la demande et la fin d'intervention **afin de** mesurer la réactivité.

- **Étant donné** des interventions terminées sur la période, **quand** le tableau de bord s'affiche, **alors** le délai moyen apparaît en heures, par type d'intervention.

### US28 — Interventions en retard · Should

**En tant que** gestionnaire, **je veux** voir les interventions non planifiées depuis plus de 48 h **afin de** les traiter en priorité.

- **Étant donné** des interventions « à planifier » créées il y a plus de 48 h, **quand** j'ouvre le tableau de bord, **alors** elles apparaissent dans une liste triée de la plus ancienne à la plus récente.
- **Étant donné** une intervention urgente non planifiée depuis plus de 4 h, **quand** j'ouvre le tableau de bord, **alors** elle est signalée en tête (RG16).

### US29 — Export CSV · Could

**En tant qu'**administrateur, **je veux** exporter la liste des interventions en CSV **afin de** l'exploiter dans un tableur.

- **Étant donné** une liste filtrée, **quand** je clique sur « Exporter », **alors** un fichier CSV contenant uniquement les lignes filtrées est téléchargé.

---

## Définition de « prêt » et de « terminé »

**Une user story est prête à être développée quand :**

- [ ] sa formulation et ses critères d'acceptation sont validés par le binôme ;
- [ ] les maquettes des écrans concernés existent ;
- [ ] les tables et routes nécessaires sont identifiées.

**Une user story est terminée quand :**

- [ ] tous ses critères d'acceptation sont respectés ;
- [ ] les règles de gestion concernées sont vérifiées par des tests unitaires ;
- [ ] ses tests d'intégration passent en local ;
- [ ] le code a été relu par l'autre membre du binôme et fusionné dans `develop`.
