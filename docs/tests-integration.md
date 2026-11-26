# Tests d'intégration — matrice de traçabilité

Ce document relie chaque exigence du projet (user story, scénario de test du cahier des charges, règle de gestion, mesure de sécurité) au test d'intégration qui la prouve. Les tests appellent l'API par HTTP (Supertest), sur des bases PostgreSQL et MongoDB éphémères démarrées par Testcontainers : ils vérifient l'application telle qu'elle tourne, de la route jusqu'à la base.

Lancement, Docker Desktop démarré, depuis la racine du dépôt :

```powershell
npm run test:e2e
```

Un seul fichier : `npx vitest run --config ./vitest.config.e2e.ts test/clients.e2e-spec.ts` (dans `backend/`).

Les tests se trouvent dans `backend/test/`. Une référence `clients` › « … » désigne le test de ce titre dans `clients.e2e-spec.ts`.

**Statuts** : **Couvert** (prouvé par un test d'intégration) · **Unitaire** (prouvé par un test unitaire seulement, sans base) · **Non développé** (la route n'existe pas encore) · **Hors MVP**.

## 1. User stories

| US | Priorité | Preuve | Statut |
| --- | --- | --- | --- |
| US01 Se connecter | M | `authentification` › « POST /auth/login (US01) » : session, cookie sécurisé, e-mail sans casse, TI01 | Couvert |
| US02 Se déconnecter | M | `authentification` › « POST /auth/logout (US02) révoque la session et vide le cookie » | Couvert |
| US03 Gérer les comptes | M | `utilisateurs` › « création (US03, RG23) », « liste et droits (US03) », « modification et désactivation (US03) » ; `authentification` › « la désactivation par l'administrateur coupe les sessions du compte (US03) » | Couvert |
| US04 Réinitialiser son mot de passe | S | Routes `/auth/forgot-password` et `/auth/reset-password` non développées (Mailpit) | Non développé |
| US05 Modifier son profil | C | `utilisateurs` › « son propre profil (US05) » ; `authentification` › « un changement de mot de passe coupe les sessions ouvertes » | Couvert |
| US06 Créer un client | M | `clients` › « création (US06) » | Couvert |
| US07 Gérer les adresses | M | `clients` › « adresses (US07) » | Couvert |
| US08 Rechercher un client | M | `clients` › « recherche et liste (US08) » | Couvert |
| US09 Historique d'un client | S | `clients` › « historique (US09) » | Couvert |
| US10 Modifier ou archiver un client | M | `clients` › « consultation et modification (US06, US10) », « archivage (US10, RG22) » | Couvert |
| US11 Fiche technicien | M | `techniciens` › « création (US11) », « liste, consultation et modification (US11) », « archivage (US11, RG22) » | Couvert |
| US12 Indisponibilités | M | `techniciens` › « indisponibilités (US12, RG10) » | Couvert |
| US13 Compétences | C | — | Hors MVP |
| US14 Créer une intervention | M | `interventions` › « POST /interventions : créer (US14) » | Couvert |
| US15 Filtrer les interventions | M | `interventions` › « GET /interventions : lister et filtrer (US15) » | Couvert |
| US16 Modifier ou annuler | M | `interventions` › « modifie la description et l'urgence d'une intervention planifiée… », « annule une intervention en cours… » | Couvert |
| US17 Statut sur le terrain | M | `interventions` › « créer → affecter → démarrer → terminer → compléter le compte rendu », « transitions interdites (400) », TI07 | Couvert |
| US18 Compte rendu | S | `interventions` › « enregistre le compte rendu envoyé avec la fin de l'intervention » | Couvert |
| US19 Historique des statuts | S | `journal` › « GET /interventions/:id/history renvoie l'entrée au format du contrat » | Couvert |
| US20 Créer une tournée | M | `tournees` › « POST /tours : créer une tournée (US20) » | Couvert |
| US21 Affecter une intervention | M | `tournees` › « POST /tours/:id/interventions : affecter une intervention (US21) » | Couvert |
| US22 Réordonner une tournée | M | `tournees` › « PUT /tours/:id/order : réordonner (US22) » | Couvert |
| US23 Planning jour / semaine | M | `tournees` › « GET /tours : planning (US23) » | Couvert |
| US24 Tournée du jour | M | `tournees` › « GET /tours/me/today : ma tournée du jour (US24) » | Couvert |
| US25 Insérer une urgence | S | Route `POST /tours/:id/urgent-insertions` non développée | Non développé |
| US26 Interventions par statut et technicien | **M** | Requête SQL testée : `reporting` › « nombre d'interventions par technicien et par statut ». Route `/dashboard/activity` absente (card #57) | **Non développé** |
| US27 Délai de traitement | S | Requête SQL testée : `reporting` › « temps moyen de traitement ». Route absente (card #57) | Non développé |
| US28 Interventions en retard | S | Route `/dashboard/alerts` absente (card #57) | Non développé |
| US29 Export CSV des interventions | S | `export-csv` › « GET /interventions/export (US29) » | Couvert |
| US31 Import CSV des clients | S | `import-clients` › « POST /clients/import/analysis », « POST /clients/import » | Couvert |
| US32 Export CSV des clients | S | `export-csv` › « GET /clients/export (US32) » ; `import-clients` › « aller-retour export → import (US32) » | Couvert |
| US33 Signature du client | S | `interventions` › « termine l'intervention et enregistre la signature à l'heure de la clôture » ; `journal` › « une clôture signée écrit SIGNATURE_ENREGISTREE… » | Couvert |

## 2. Scénarios de test du cahier des charges (section 10.2)

| TI | Scénario | Preuve | Statut |
| --- | --- | --- | --- |
| TI01 | Mot de passe erroné : 401, message générique | `authentification` › « TI01 : même réponse pour un mot de passe faux, un e-mail inconnu ou un compte désactivé » | Couvert |
| TI02 | Technicien sur `GET /clients` : 403 | `clients` › « répond 403 à un technicien (TI02) » ; `authentification` › « TI02 : un technicien authentifié reçoit 403 sur GET /clients » | Couvert |
| TI03 | Création valide : 201, « à planifier » | `interventions` › « TI03 et RG01 : crée l'intervention à planifier… » | Couvert |
| TI04 | Créneau occupé : 409 | `tournees` › « TI04 : refuse en 409 un créneau déjà occupé, sans rien modifier » | Couvert |
| TI05 | Pendant une indisponibilité : 409 | `tournees` › « TI05 : refuse en 409 un créneau pendant une indisponibilité » | Couvert |
| TI06 | « À planifier » directement à « terminée » : 400 | `interventions` › « TI06 : refuse en 400 de terminer directement une intervention à planifier, sans rien changer » | Couvert |
| TI07 | Technicien qui termine l'intervention d'un collègue : 403 | `interventions` › « TI07 : répond 403 au technicien qui termine l'intervention d'un collègue… » | Couvert |
| TI08 | Annulation sans motif : 400 | `interventions` › « TI08 et RG05 : refuse en 400 une annulation sans motif, sans rien changer » | Couvert |
| TI09 | Tableau de bord sur une période | Route absente (card #57) | Non développé |
| TI10 | Recherche avec `' OR 1=1 --` | `clients` › « ne laisse pas une injection SQL modifier la requête (TI10) » ; `interventions` et `tournees` › « TI10… » | Couvert |
| TI11 | Intervention d'un collègue : 403 ou 404 | `interventions` › « TI11 : un technicien ne lit pas la tournée d'un collègue… » | Couvert |
| TI12 | Tournée à une date passée : 400 | `tournees` › « TI12 : refuse en 400 une tournée à une date passée » | Couvert |
| TI13 | Deuxième tournée le même jour : 409 | `tournees` › « TI13 : refuse en 409 une deuxième tournée le même jour… » | Couvert |
| TI14 | Deux interventions au même rang : 400, rien modifié | `tournees` › « TI14 : refuse en 400 deux fois la même intervention, sans rien modifier » | Couvert |

## 3. Règles de gestion

| RG | Règle (résumé) | Preuve | Statut |
| --- | --- | --- | --- |
| RG01 | Création au statut « à planifier » | `interventions` › « TI03 et RG01 : crée l'intervention à planifier… » | Couvert |
| RG02 | « Planifiée » seulement par affectation | `tournees` › « planifie l'intervention sur le créneau et journalise le changement de statut » | Couvert |
| RG03 | Seul le technicien affecté démarre et termine | `interventions` › « répond 403 au technicien qui démarre l'intervention d'un collègue », TI07 | Couvert |
| RG04 | Retrait de la tournée : retour à « à planifier » | `tournees` › « DELETE /tours/:id/interventions/:interventionId : retirer (RG04) » | Couvert |
| RG05 | Annulation avec motif, sauf si terminée | `interventions` › « annuler une intervention terminée » (400), TI08 | Couvert |
| RG06 | Terminée ou annulée : non modifiable | `interventions` › « RG06 : modifier une intervention annulée » (400) | Couvert |
| RG07 | Changements de statut historisés | `journal` › « planifier une intervention crée un document STATUT_MODIFIE dans journal_actions » | Couvert |
| RG08 | Une tournée par technicien et par jour | `tournees` › TI13, « RG08 : deux créations simultanées donnent une tournée et un 409 » | Couvert |
| RG09 | Pas de chevauchement | `tournees` › TI04, « RG09 : deux affectations simultanées sur le même créneau… » ; `interventions` › « RG09 : refuse en 409 une durée allongée… » | Couvert |
| RG10 | Pas d'affectation pendant une indisponibilité | `tournees` › TI05, « RG10 : une affectation et une indisponibilité simultanées… » ; `techniciens` › « indisponibilités (US12, RG10) » | Couvert |
| RG11 | Créneaux de 7 h à 19 h, à La Réunion | `tournees` › « RG11 : refuse en 400 un créneau qui finit après 19 h à La Réunion » | Couvert |
| RG12 | Pas de tournée à une date passée | `tournees` › TI12 | Couvert |
| RG13 | Rang unique dans la tournée | `tournees` › « insère au rang demandé et décale les suivantes » | Couvert |
| RG14 | Réordonnancement en transaction | `tournees` › « enregistre le nouvel ordre en une transaction », TI14 | Couvert |
| RG15 | « En cours » : non déplaçable | `tournees` › « refuse en 400 de retirer une intervention en cours (RG15) » | Couvert |
| RG16 | « Terminée » : non réordonnable | `tournees` › « RG16 : refuse en 400 de déplacer une intervention terminée » | Couvert |
| RG17 | Niveau d'urgence : normale, prioritaire, urgente | Tests unitaires de validation des interventions | Unitaire |
| RG18 | Urgentes en tête des listes | `interventions` › « RG18 : urgentes, puis prioritaires, puis normales… » | Couvert |
| RG19 | Urgence non planifiée depuis 4 h signalée | Route `/dashboard/alerts` absente (card #57) | Non développé |
| RG20 | Retard 15 minutes après le début prévu | `tournees` › « GET /tours/me/today » (`enRetard` vrai) | Couvert |
| RG21 | Au moins une adresse | `clients` › « refuse un client sans adresse… (RG21) », « refuse d'archiver la dernière adresse du client (RG21) » | Couvert |
| RG22 | Archivage plutôt que suppression | `clients` › « archivage (US10, RG22) » ; `techniciens` › « archivage (US11, RG22) » | Couvert |
| RG23 | E-mail de compte unique | `utilisateurs` › « RG23 : refuse en 409 un e-mail déjà utilisé… », « RG23 : deux créations simultanées du même e-mail donnent un 201 et un 409 » | Couvert |
| RG24 | Démarrage le jour de la tournée | `interventions` › « refuse en 400 de démarrer une intervention de la tournée de demain » | Couvert |
| RG25 à RG29 | Import et export CSV | `import-clients`, `export-csv` (droits, encodage, limites, doublons, transaction) | Couvert |
| RG30 à RG35 | Signature du client | `interventions` › tests de la signature (RG31, RG32, RG34, taille de l'image) | Couvert |

## 4. Mesures de sécurité

| Mesure | Preuve | Statut |
| --- | --- | --- |
| TS-01 Aucune route ouverte par défaut | `securite` › « TS-01 : aucune route n'est ouverte par défaut » | Couvert |
| TS-02 Changements de statut journalisés | `journal` › « TS-02 : changement de statut fait par un technicien » | Couvert |
| TS-03 Accès refusés journalisés | `journal` › « TS-03 : les accès refusés (403) sont journalisés » | Couvert |
| TS-05 Champ inconnu refusé sur chaque route | `securite` › « TS-05 : un champ inconnu est refusé sur chaque route » | Couvert |
| TS-06 Aucune fuite d'erreur interne | `securite` › « TS-06 : une erreur interne ne fuit pas vers le client » | Couvert |
| Authentification | `authentification` : jeton haché, jeton falsifié refusé, rotation et détection de vol, limitation des tentatives (429), en-têtes Helmet | Couvert |

## 5. Restant à faire

| Élément | Raison | Suite |
| --- | --- | --- |
| US26 (Must), US27, US28, TI09, RG19 | Routes `/dashboard` non développées | Card #57 |
| US25 | Route d'insertion d'une urgence non développée | À planifier |
| US04 | Mot de passe oublié non développé | Dépend de Mailpit |
