# Contrat de l'API — Plumbly

Ce document définit le contrat de l'API REST de Plumbly : les routes, les données échangées, les codes de retour et les droits par rôle. Il est rédigé **avant** le développement pour que le front-end et le back-end de chaque fonctionnalité, ainsi que les modules qui dépendent les uns des autres, s'appuient sur les mêmes routes. La version exécutable de ce contrat est publiée par Swagger sur `/api/docs`.

| Ressources | Responsable |
| --- | --- |
| Authentification, utilisateurs, interventions, types d'intervention | Loïc BOTSY |
| Clients, adresses, techniciens, indisponibilités, tournées, tableau de bord | Arnaud BIDEL |

## 1. Conventions générales

| Élément | Convention | Exemple |
| --- | --- | --- |
| URL de base | Préfixe versionné | `http://localhost:3000/api/v1` |
| Format | JSON en UTF-8 | `Content-Type: application/json` |
| Noms des ressources | Anglais, au pluriel (cahier des charges, 8.3) | `/interventions`, `/tours` |
| Noms des champs | Français, en camelCase, identiques au dictionnaire de données | `debutPrevu`, `dureeEstimeeMin` |
| Identifiants | Entiers | `"id": 42` |
| Dates et heures | ISO 8601 **avec fuseau obligatoire** (`Z` ou `+04:00`) ; renvoyées en UTC ; affichées à l'heure de La Réunion (UTC+4, sans heure d'été) par le front | `"2026-11-24T08:00:00.000Z"` |
| Dates seules | ISO 8601 ; un jour s'entend à l'heure de La Réunion | `"2026-11-24"` |
| Énumérations | Majuscules, séparées par `_` | `"A_PLANIFIER"`, `"GESTIONNAIRE"` |
| Champs inconnus | Refusés (`whitelist` et `forbidNonWhitelisted`) | `400` |

Les noms de champs reprennent ceux du [modèle de données](modele-donnees.md) : `debut_prevu` en base devient `debutPrevu` dans l'API. Prisma fait la correspondance avec `@map`.

## 2. Authentification

| Élément | Fonctionnement |
| --- | --- |
| Jeton d'accès | JWT valable 15 minutes, renvoyé dans le corps de la réponse de connexion |
| Envoi du jeton | En-tête `Authorization: Bearer <jeton d'accès>` sur chaque route protégée |
| Jeton de rafraîchissement | Valable 7 jours, dans un cookie `httpOnly`, `Secure`, `SameSite=Strict`, limité au chemin `/api/v1/auth` |
| Renouvellement | `POST /auth/refresh` : nouveau jeton d'accès et nouveau jeton de rafraîchissement (rotation) |
| Révocation | Déconnexion, changement de mot de passe ou désactivation du compte (voir [ADR 0007](adr/0007-authentification-jwt-et-argon2.md)) |

Notation des droits dans les tableaux : **Public** (sans connexion), **Connecté** (tout rôle), **ADMIN**, **GEST** (gestionnaire), **TECH** (technicien).

## 3. Erreurs et codes de retour

Toutes les erreurs suivent le même format :

```json
{
  "statusCode": 409,
  "message": "Le technicien a déjà une intervention sur ce créneau.",
  "error": "Conflict"
}
```

Pour une erreur de validation, `message` contient la liste des champs en erreur :

```json
{
  "statusCode": 400,
  "message": ["dureeEstimeeMin doit être un entier positif", "urgence doit être NORMALE, PRIORITAIRE ou URGENTE"],
  "error": "Bad Request"
}
```

| Code | Signification | Exemple dans Plumbly |
| --- | --- | --- |
| `200` | Succès avec contenu | Liste des interventions |
| `201` | Ressource créée | Création d'une intervention |
| `204` | Succès sans contenu | Déconnexion |
| `400` | Données invalides ou action interdite par une règle de gestion | Annulation sans motif, transition de statut interdite |
| `401` | Non authentifié ou jeton expiré | Jeton d'accès absent ou expiré |
| `403` | Authentifié mais non autorisé | Un technicien appelle `GET /clients`, ou modifie l'intervention d'un collègue |
| `404` | Ressource introuvable | Intervention inexistante |
| `409` | Conflit avec l'état existant | Créneau déjà occupé, e-mail déjà utilisé, deuxième tournée le même jour |
| `429` | Trop de requêtes | Plus de 5 tentatives de connexion en 15 minutes |
| `500` | Erreur interne | Message générique, sans détail technique |

Un message d'erreur ne révèle jamais d'information sensible : pas de trace technique, pas de requête SQL, et un message unique « E-mail ou mot de passe incorrect » à la connexion.

## 4. Pagination, filtres et tri

Les listes sont paginées : `?page=1&limit=20`. La valeur par défaut est 20 éléments, le maximum 100.

```json
{
  "data": [ { "id": 42, "statut": "A_PLANIFIER" } ],
  "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 }
}
```

| Paramètre | Rôle | Exemple |
| --- | --- | --- |
| `page`, `limit` | Pagination | `?page=2&limit=50` |
| `recherche` | Recherche textuelle, insensible à la casse et aux accents | `?recherche=dupont` |
| `tri` | Champ de tri ; `-` devant pour l'ordre décroissant | `?tri=-creeLe` |
| Filtres propres à chaque ressource | Combinables entre eux | `?statut=A_PLANIFIER&urgence=URGENTE` |

## 5. Liste des routes

Chaque route est rattachée à une user story ([user-stories.md](user-stories.md)). Les changements de statut et l'archivage ont des routes dédiées plutôt qu'une modification générique : chaque action a ses propres règles et ses propres droits, ce qui la rend explicite, sécurisée et testable.

### 5.1 Authentification — Loïc

| Méthode | Route | Droits | Rôle de la route | US |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | Public | Se connecter : renvoie le jeton d'accès et pose le cookie de rafraîchissement | US01 |
| POST | `/auth/refresh` | Public (cookie) | Renouveler le jeton d'accès | US01 |
| POST | `/auth/logout` | Connecté | Se déconnecter : révoque le jeton de rafraîchissement | US02 |
| POST | `/auth/forgot-password` | Public | Demander un lien de réinitialisation | US04 |
| POST | `/auth/reset-password` | Public | Choisir un nouveau mot de passe avec le lien reçu | US04 |

### 5.2 Utilisateurs — Loïc

| Méthode | Route | Droits | Rôle de la route | US |
| --- | --- | --- | --- | --- |
| GET | `/users/me` | Connecté | Consulter son profil (rôle, mot de passe à changer) | US01, US05 |
| PATCH | `/users/me` | Connecté | Modifier son profil | US05 |
| PATCH | `/users/me/password` | Connecté | Changer son mot de passe (obligatoire à la première connexion) | US03, US05 |
| GET | `/users` | ADMIN | Lister les comptes | US03 |
| POST | `/users` | ADMIN | Créer un compte avec un mot de passe provisoire | US03 |
| GET | `/users/:id` | ADMIN | Consulter un compte | US03 |
| PATCH | `/users/:id` | ADMIN | Modifier un compte | US03 |
| POST | `/users/:id/deactivate` | ADMIN | Désactiver un compte et révoquer ses sessions | US03 |
| POST | `/users/:id/activate` | ADMIN | Réactiver un compte | US03 |

### 5.3 Interventions — Loïc

| Méthode | Route | Droits | Rôle de la route | US |
| --- | --- | --- | --- | --- |
| GET | `/interventions` | ADMIN, GEST | Lister et filtrer les interventions, urgentes en tête | US15 |
| POST | `/interventions` | ADMIN, GEST | Créer une intervention au statut « à planifier » | US14 |
| GET | `/interventions/:id` | ADMIN, GEST, TECH (les siennes) | Consulter une intervention | US14, US24 |
| PATCH | `/interventions/:id` | ADMIN, GEST | Modifier une intervention non terminée | US16 |
| POST | `/interventions/:id/cancel` | ADMIN, GEST | Annuler avec un motif | US16 |
| POST | `/interventions/:id/start` | TECH (affecté) | Passer à « en cours » | US17 |
| POST | `/interventions/:id/complete` | TECH (affecté) | Passer à « terminée », avec compte rendu facultatif | US17, US18 |
| PATCH | `/interventions/:id/report` | TECH (affecté) | Compléter le compte rendu d'une intervention terminée | US18 |
| GET | `/interventions/:id/history` | ADMIN, GEST | Historique des statuts, lu dans le journal MongoDB | US19 |

### 5.4 Types d'intervention — Loïc

| Méthode | Route | Droits | Rôle de la route | US |
| --- | --- | --- | --- | --- |
| GET | `/intervention-types` | Connecté | Lister les types et leur durée par défaut | US14 |
| POST | `/intervention-types` | ADMIN | Créer un type | US14 |
| PATCH | `/intervention-types/:id` | ADMIN | Modifier un type ou sa durée par défaut | US14 |

### 5.5 Clients et adresses — Arnaud

| Méthode | Route | Droits | Rôle de la route | US |
| --- | --- | --- | --- | --- |
| GET | `/clients` | ADMIN, GEST | Rechercher et lister les clients | US08 |
| POST | `/clients` | ADMIN, GEST | Créer un client avec sa première adresse | US06 |
| GET | `/clients/:id` | ADMIN, GEST | Consulter un client et ses adresses | US06 |
| PATCH | `/clients/:id` | ADMIN, GEST | Modifier un client | US10 |
| POST | `/clients/:id/archive` | ADMIN, GEST | Archiver un client | US10 |
| GET | `/clients/:id/interventions` | ADMIN, GEST | Historique des interventions du client | US09 |
| POST | `/clients/:id/addresses` | ADMIN, GEST | Ajouter une adresse | US07 |
| PATCH | `/clients/:id/addresses/:addressId` | ADMIN, GEST | Modifier une adresse | US07 |
| POST | `/clients/:id/addresses/:addressId/archive` | ADMIN, GEST | Archiver une adresse (refusé s'il n'en reste qu'une) | US07 |

### 5.6 Techniciens et indisponibilités — Arnaud

| Méthode | Route | Droits | Rôle de la route | US |
| --- | --- | --- | --- | --- |
| GET | `/technicians` | ADMIN, GEST | Lister les techniciens | US11 |
| POST | `/technicians` | ADMIN, GEST | Créer la fiche d'un compte technicien | US11 |
| GET | `/technicians/:id` | ADMIN, GEST | Consulter un technicien | US11 |
| PATCH | `/technicians/:id` | ADMIN, GEST | Modifier un technicien | US11 |
| POST | `/technicians/:id/archive` | ADMIN, GEST | Archiver un technicien | US11 |
| GET | `/technicians/:id/unavailabilities` | ADMIN, GEST | Lister ses indisponibilités | US12 |
| POST | `/technicians/:id/unavailabilities` | ADMIN, GEST | Ajouter une indisponibilité | US12 |
| DELETE | `/technicians/:id/unavailabilities/:unavailabilityId` | ADMIN, GEST | Supprimer une indisponibilité | US12 |

### 5.7 Tournées et planning — Arnaud

| Méthode | Route | Droits | Rôle de la route | US |
| --- | --- | --- | --- | --- |
| GET | `/tours` | ADMIN, GEST | Planning sur une période (`du`, `au`, `technicienId`) | US23 |
| POST | `/tours` | ADMIN, GEST | Créer la tournée d'un technicien pour une date | US20 |
| GET | `/tours/:id` | ADMIN, GEST | Consulter une tournée et ses interventions | US23 |
| GET | `/tours/me/today` | TECH | Sa tournée du jour, dans l'ordre | US24 |
| POST | `/tours/:id/interventions` | ADMIN, GEST | Affecter une intervention sur un créneau (passe à « planifiée ») | US21 |
| DELETE | `/tours/:id/interventions/:interventionId` | ADMIN, GEST | Retirer une intervention (revient à « à planifier ») | US21 |
| PUT | `/tours/:id/order` | ADMIN, GEST | Réordonner les interventions, dans une transaction | US22 |
| POST | `/tours/:id/urgent-insertions` | ADMIN, GEST | Insérer une urgence : simulation du décalage, puis validation | US25 |

### 5.8 Tableau de bord — Arnaud

| Méthode | Route | Droits | Rôle de la route | US |
| --- | --- | --- | --- | --- |
| GET | `/dashboard/activity` | ADMIN, GEST | Interventions par statut et par technicien sur une période (SQL manuel) | US26 |
| GET | `/dashboard/processing-time` | ADMIN | Délai moyen de traitement par type (SQL manuel) | US27 |
| GET | `/dashboard/alerts` | ADMIN, GEST | Interventions en retard, urgences non planifiées | US28 |

## 6. Détail des routes

Pour chaque route : les données envoyées (DTO) et leurs règles de validation, la réponse en cas de succès, les erreurs possibles et les effets. Les DTO sont implémentés avec `class-validator` ; les erreurs listées servent de base aux tests d'intégration (card #12).

**Politique de mot de passe** (cahier des charges, 6.1) : 12 caractères minimum, avec au moins une majuscule, une minuscule, un chiffre et un caractère spécial.

### 6.1 Authentification — Loïc

#### `POST /auth/login` — se connecter (US01)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `email` | texte | Obligatoire, format e-mail |
| `motDePasse` | texte | Obligatoire |

Réponse `200` :

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "utilisateur": { "id": 3, "email": "sophie.martin@plomberie-durand.fr", "nom": "Martin", "prenom": "Sophie", "role": "GESTIONNAIRE", "mdpAChanger": false }
}
```

En-tête de la réponse : `Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou e-mail mal formé |
| `401` | E-mail inconnu, mot de passe incorrect **ou** compte désactivé : toujours le même message, « E-mail ou mot de passe incorrect » |
| `429` | Plus de 5 tentatives en 15 minutes |

Effets : mise à jour de `derniereConnexion` ; création d'un jeton de rafraîchissement (stocké haché) ; journal `CONNEXION_REUSSIE` ou `CONNEXION_ECHOUEE` (e-mail masqué).

Le front redirige selon `role` : tableau de bord pour ADMIN et GEST, « Ma tournée du jour » pour TECH. Si `mdpAChanger` vaut `true`, il impose d'abord le changement de mot de passe.

#### `POST /auth/refresh` — renouveler le jeton d'accès

Aucun corps : le jeton de rafraîchissement est lu dans le cookie.

Réponse `200` : `{ "accessToken": "…", "expiresIn": 900 }` et un **nouveau** cookie de rafraîchissement.

| Erreur | Cas |
| --- | --- |
| `401` | Cookie absent, jeton expiré, révoqué ou compte désactivé |

Effets : l'ancien jeton de rafraîchissement est révoqué et remplacé (rotation). Si un jeton **déjà révoqué** est présenté, c'est le signe d'un vol : toutes les sessions de l'utilisateur sont révoquées.

#### `POST /auth/logout` — se déconnecter (US02)

Aucun corps. En-tête `Authorization` et cookie de rafraîchissement.

Réponse `204`, avec un cookie vidé (`Max-Age=0`).

| Erreur | Cas |
| --- | --- |
| `401` | Jeton d'accès absent ou expiré |

Effets : le jeton de rafraîchissement de la session est révoqué en base.

#### `POST /auth/forgot-password` — demander une réinitialisation (US04)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `email` | texte | Obligatoire, format e-mail |

Réponse `204` **dans tous les cas**, que l'e-mail existe ou non, pour ne pas révéler les comptes existants.

| Erreur | Cas |
| --- | --- |
| `400` | E-mail mal formé |
| `429` | Plus de 3 demandes en 15 minutes |

Effets : si le compte existe et est actif, création d'un jeton de réinitialisation valable 30 minutes (stocké haché) et envoi d'un e-mail contenant le lien.

#### `POST /auth/reset-password` — choisir un nouveau mot de passe (US04)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `jeton` | texte | Obligatoire |
| `nouveauMotDePasse` | texte | Obligatoire, politique de mot de passe |

Réponse `204`.

| Erreur | Cas |
| --- | --- |
| `400` | Jeton invalide, expiré ou déjà utilisé (même message) ; mot de passe non conforme à la politique |

Effets : mot de passe mis à jour (haché avec argon2) ; jeton marqué comme utilisé ; **toutes les sessions de l'utilisateur révoquées** ; `mdpAChanger` passe à `false`.

### 6.2 Utilisateurs — Loïc

L'objet **Utilisateur** renvoyé par l'API ne contient jamais l'empreinte du mot de passe :

```json
{
  "id": 7,
  "email": "karim.benali@plomberie-durand.fr",
  "nom": "Benali",
  "prenom": "Karim",
  "role": "TECHNICIEN",
  "actif": true,
  "mdpAChanger": false,
  "derniereConnexion": "2026-11-24T06:45:10.000Z",
  "creeLe": "2026-11-20T09:00:00.000Z"
}
```

#### `GET /users/me` — consulter son profil (US01, US05)

Réponse `200` : l'objet Utilisateur de la personne connectée.

| Erreur | Cas |
| --- | --- |
| `401` | Non connecté |

#### `PATCH /users/me` — modifier son profil (US05)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `nom` | texte | Facultatif, 1 à 100 caractères |
| `prenom` | texte | Facultatif, 1 à 100 caractères |

L'e-mail et le rôle ne sont pas modifiables par l'utilisateur lui-même.

Réponse `200` : l'objet Utilisateur mis à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Champ invalide, ou champ non autorisé (`email`, `role`…) |
| `401` | Non connecté |

#### `PATCH /users/me/password` — changer son mot de passe (US03, US05)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `ancienMotDePasse` | texte | Obligatoire |
| `nouveauMotDePasse` | texte | Obligatoire, politique de mot de passe, différent de l'ancien |

Réponse `204`.

| Erreur | Cas |
| --- | --- |
| `400` | Ancien mot de passe incorrect ; nouveau mot de passe non conforme ou identique à l'ancien |
| `401` | Non connecté |

Effets : mot de passe mis à jour ; `mdpAChanger` passe à `false` ; les autres sessions de l'utilisateur sont révoquées.

Un ancien mot de passe incorrect renvoie `400` et non `401` : le front interprète un `401` comme une session expirée et déconnecterait l'utilisateur à tort.

#### `GET /users` — lister les comptes (US03)

| Paramètre | Validation |
| --- | --- |
| `page`, `limit`, `tri` | Voir section 4 |
| `recherche` | Sur le nom, le prénom et l'e-mail |
| `role` | `ADMIN`, `GESTIONNAIRE` ou `TECHNICIEN` |
| `actif` | `true` ou `false` |

Réponse `200` : liste paginée d'objets Utilisateur.

| Erreur | Cas |
| --- | --- |
| `401` | Non connecté |
| `403` | Rôle autre qu'ADMIN |

#### `POST /users` — créer un compte (US03)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `email` | texte | Obligatoire, format e-mail, unique |
| `nom` | texte | Obligatoire, 1 à 100 caractères |
| `prenom` | texte | Obligatoire, 1 à 100 caractères |
| `role` | énumération | Obligatoire : `ADMIN`, `GESTIONNAIRE` ou `TECHNICIEN` |

Réponse `201` :

```json
{
  "utilisateur": { "id": 12, "email": "julie.roche@plomberie-durand.fr", "nom": "Roche", "prenom": "Julie", "role": "TECHNICIEN", "actif": true, "mdpAChanger": true, "derniereConnexion": null, "creeLe": "2026-11-24T10:00:00.000Z" },
  "motDePasseProvisoire": "Vx7!kq2Lm#9pRt"
}
```

Le mot de passe provisoire est généré par le serveur, conforme à la politique, et affiché **une seule fois** : il n'est stocké que sous forme hachée. L'administrateur le transmet à l'employé, qui doit le changer à sa première connexion.

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou invalide |
| `401` | Non connecté |
| `403` | Rôle autre qu'ADMIN |
| `409` | E-mail déjà utilisé (RG23) |

Effets : journal `COMPTE_CREE`. Pour un technicien, la fiche technicien est créée ensuite par `POST /technicians` (US11).

#### `GET /users/:id` — consulter un compte (US03)

Réponse `200` : l'objet Utilisateur.

| Erreur | Cas |
| --- | --- |
| `401` | Non connecté |
| `403` | Rôle autre qu'ADMIN |
| `404` | Compte inexistant |

#### `PATCH /users/:id` — modifier un compte (US03)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `email` | texte | Facultatif, format e-mail, unique |
| `nom` | texte | Facultatif, 1 à 100 caractères |
| `prenom` | texte | Facultatif, 1 à 100 caractères |
| `role` | énumération | Facultatif |

Réponse `200` : l'objet Utilisateur mis à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Champ invalide |
| `401` | Non connecté |
| `403` | Rôle autre qu'ADMIN |
| `404` | Compte inexistant |
| `409` | E-mail déjà utilisé ; changement de rôle d'un technicien qui a une fiche technicien |

#### `POST /users/:id/deactivate` — désactiver un compte (US03)

Aucun corps. Réponse `200` : l'objet Utilisateur avec `actif` à `false`.

| Erreur | Cas |
| --- | --- |
| `400` | L'administrateur tente de désactiver son propre compte |
| `401` | Non connecté |
| `403` | Rôle autre qu'ADMIN |
| `404` | Compte inexistant |

Effets : toutes les sessions du compte sont révoquées immédiatement ; journal `COMPTE_DESACTIVE`. Les données du compte restent dans l'historique.

#### `POST /users/:id/activate` — réactiver un compte (US03)

Aucun corps. Réponse `200` : l'objet Utilisateur avec `actif` à `true`.

| Erreur | Cas |
| --- | --- |
| `401` | Non connecté |
| `403` | Rôle autre qu'ADMIN |
| `404` | Compte inexistant |

### 6.3 Interventions — Loïc

#### Transitions de statut

Le statut ne se modifie jamais directement : il change uniquement par les routes d'action ci-dessous, qui appliquent les règles de gestion du [cahier des charges](cahier-des-charges.md#5-règles-de-gestion).

| Route | Statut de départ | Statut d'arrivée | Droits | Règles |
| --- | --- | --- | --- | --- |
| `POST /interventions` | — | `A_PLANIFIER` | ADMIN, GEST | RG01 |
| `POST /tours/:id/interventions` (Arnaud) | `A_PLANIFIER` | `PLANIFIEE` | ADMIN, GEST | RG02, RG09, RG10, RG11 |
| `DELETE /tours/:id/interventions/:interventionId` (Arnaud) | `PLANIFIEE` | `A_PLANIFIER` | ADMIN, GEST | RG04 |
| `POST /interventions/:id/start` | `PLANIFIEE` | `EN_COURS` | TECH affecté | RG03 |
| `POST /interventions/:id/complete` | `EN_COURS` | `TERMINEE` | TECH affecté | RG03 |
| `POST /interventions/:id/cancel` | `A_PLANIFIER`, `PLANIFIEE`, `EN_COURS` | `ANNULEE` | ADMIN, GEST | RG05 |

Toute autre transition est refusée (`400`). Chaque changement de statut est enregistré dans le journal des actions (`STATUT_MODIFIE` ou `INTERVENTION_ANNULEE`, RG07). Un technicien « affecté » est celui de la tournée qui contient l'intervention.

L'objet **Intervention** renvoyé par l'API contient des résumés des éléments liés, pour que les écrans s'affichent en un seul appel :

```json
{
  "id": 42,
  "description": "Fuite sous l'évier de la cuisine",
  "urgence": "PRIORITAIRE",
  "statut": "PLANIFIEE",
  "dureeEstimeeMin": 60,
  "debutPrevu": "2026-11-25T08:00:00.000Z",
  "finPrevue": "2026-11-25T09:00:00.000Z",
  "enRetard": false,
  "ordreTournee": 2,
  "compteRendu": null,
  "motifAnnulation": null,
  "demarreeLe": null,
  "termineeLe": null,
  "annuleeLe": null,
  "creeLe": "2026-11-24T09:12:00.000Z",
  "majLe": "2026-11-24T09:30:00.000Z",
  "type": { "id": 1, "libelle": "Fuite" },
  "adresse": { "id": 15, "rue": "12 rue des Lilas", "complement": "Bât. B", "codePostal": "69003", "ville": "Lyon", "infosAcces": "Code 4521, 3e étage" },
  "client": { "id": 8, "typeClient": "PARTICULIER", "nomAffiche": "Jean Dupont", "telephone": "0692123456" },
  "tournee": { "id": 5, "dateTournee": "2026-11-25", "technicien": { "id": 2, "nom": "Benali", "prenom": "Karim" } },
  "createur": { "id": 3, "nom": "Martin", "prenom": "Sophie" }
}
```

`finPrevue` est calculée par la base (début + durée) et `enRetard` par l'API : une intervention planifiée non démarrée 15 minutes après son début prévu est en retard (RG20). `tournee` vaut `null` tant que l'intervention n'est pas planifiée. `nomAffiche` est le nom et le prénom pour un particulier, la raison sociale pour un professionnel.

#### `GET /interventions` — lister et filtrer (US15)

| Paramètre | Validation |
| --- | --- |
| `page`, `limit`, `recherche` | Voir section 4 ; la recherche porte sur la description et le nom du client |
| `statut` | Un ou plusieurs statuts séparés par des virgules : `?statut=A_PLANIFIER,PLANIFIEE` |
| `urgence` | `NORMALE`, `PRIORITAIRE` ou `URGENTE` |
| `technicienId` | Entier |
| `clientId` | Entier |
| `du`, `au` | Dates ; filtre sur le début prévu |
| `tri` | Par défaut : urgence décroissante, puis date de création croissante (RG18) |

Réponse `200` : liste paginée d'objets Intervention.

| Erreur | Cas |
| --- | --- |
| `400` | Paramètre invalide |
| `401` | Non connecté |
| `403` | Technicien (il consulte ses interventions par `GET /tours/me/today`) |

#### `POST /interventions` — créer une intervention (US14)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `adresseId` | entier | Obligatoire ; adresse existante et non archivée, d'un client non archivé |
| `typeInterventionId` | entier | Obligatoire ; type existant |
| `description` | texte | Obligatoire, 1 à 1 000 caractères |
| `urgence` | énumération | Obligatoire : `NORMALE`, `PRIORITAIRE` ou `URGENTE` |
| `dureeEstimeeMin` | entier | Facultatif, de 15 à 720 ; par défaut, la durée du type |

Le client n'est pas envoyé : il est déduit de l'adresse (voir le modèle de données, section 6).

Réponse `201` : l'objet Intervention, au statut `A_PLANIFIER` (RG01).

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou invalide ; adresse ou type inexistant ou archivé |
| `401` | Non connecté |
| `403` | Technicien |

#### `GET /interventions/:id` — consulter une intervention (US14, US24)

Réponse `200` : l'objet Intervention.

| Erreur | Cas |
| --- | --- |
| `401` | Non connecté |
| `403` | Technicien qui n'est pas affecté à cette intervention |
| `404` | Intervention inexistante |

#### `PATCH /interventions/:id` — modifier une intervention (US16)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `description` | texte | Facultatif, 1 à 1 000 caractères |
| `urgence` | énumération | Facultatif |
| `dureeEstimeeMin` | entier | Facultatif, de 15 à 720 |
| `typeInterventionId` | entier | Facultatif ; type existant |
| `adresseId` | entier | Facultatif, uniquement si l'intervention est « à planifier » |

Le statut, la tournée et l'ordre ne se modifient pas ici (routes d'action et routes des tournées).

Réponse `200` : l'objet Intervention mis à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Champ invalide ; intervention « en cours », « terminée » ou « annulée » (RG06, RG15) ; changement d'adresse d'une intervention planifiée |
| `401` | Non connecté |
| `403` | Technicien |
| `404` | Intervention inexistante |
| `409` | Nouvelle durée qui crée un chevauchement dans la tournée (RG09) |

#### `POST /interventions/:id/cancel` — annuler une intervention (US16)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `motif` | texte | Obligatoire, 1 à 500 caractères |

Réponse `200` : l'objet Intervention au statut `ANNULEE`.

| Erreur | Cas |
| --- | --- |
| `400` | Motif manquant ; intervention déjà « terminée » ou « annulée » (RG05, RG06) |
| `401` | Non connecté |
| `403` | Technicien |
| `404` | Intervention inexistante |

Effets : `annuleeLe` renseigné ; si l'intervention était dans une tournée, elle en est retirée et l'ordre des interventions suivantes est recalculé dans la même transaction (RG13, RG14) ; journal `INTERVENTION_ANNULEE` avec le motif.

#### `POST /interventions/:id/start` — démarrer une intervention (US17)

Aucun corps. Réponse `200` : l'objet Intervention au statut `EN_COURS`.

| Erreur | Cas |
| --- | --- |
| `400` | Intervention qui n'est pas « planifiée » ; tournée qui n'est pas celle du jour |
| `401` | Non connecté |
| `403` | Utilisateur qui n'est pas le technicien affecté (RG03) |
| `404` | Intervention inexistante |

Effets : `demarreeLe` renseigné ; journal `STATUT_MODIFIE`.

#### `POST /interventions/:id/complete` — terminer une intervention (US17, US18)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `compteRendu` | texte | Facultatif, 2 000 caractères maximum |

Réponse `200` : l'objet Intervention au statut `TERMINEE`.

| Erreur | Cas |
| --- | --- |
| `400` | Intervention qui n'est pas « en cours » ; compte rendu trop long |
| `401` | Non connecté |
| `403` | Utilisateur qui n'est pas le technicien affecté (RG03) |
| `404` | Intervention inexistante |

Effets : `termineeLe` renseigné ; journal `STATUT_MODIFIE`.

#### `PATCH /interventions/:id/report` — compléter le compte rendu (US18)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `compteRendu` | texte | Obligatoire, 1 à 2 000 caractères |

Réponse `200` : l'objet Intervention mis à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Intervention qui n'est pas « terminée » ; texte vide ou trop long |
| `401` | Non connecté |
| `403` | Utilisateur qui n'est pas le technicien affecté |
| `404` | Intervention inexistante |

#### `GET /interventions/:id/history` — historique des statuts (US19)

Réponse `200` : les entrées du journal MongoDB concernant l'intervention, de la plus récente à la plus ancienne.

```json
[
  {
    "date": "2026-11-25T08:03:12.000Z",
    "action": "STATUT_MODIFIE",
    "auteur": { "id": 7, "nom": "Benali", "prenom": "Karim", "role": "TECHNICIEN" },
    "avant": { "statut": "PLANIFIEE" },
    "apres": { "statut": "EN_COURS" }
  }
]
```

| Erreur | Cas |
| --- | --- |
| `401` | Non connecté |
| `403` | Technicien |
| `404` | Intervention inexistante |

### 6.4 Types d'intervention — Loïc

L'objet **Type d'intervention** : `{ "id": 1, "libelle": "Fuite", "dureeDefautMin": 60 }`.

#### `GET /intervention-types` — lister les types (US14)

Réponse `200` : la liste complète des types, triée par libellé (non paginée : la liste est courte).

| Erreur | Cas |
| --- | --- |
| `401` | Non connecté |

#### `POST /intervention-types` — créer un type (US14)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `libelle` | texte | Obligatoire, 1 à 100 caractères, unique |
| `dureeDefautMin` | entier | Obligatoire, de 15 à 720 |

Réponse `201` : l'objet Type d'intervention.

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou invalide |
| `401` | Non connecté |
| `403` | Rôle autre qu'ADMIN |
| `409` | Libellé déjà utilisé |

#### `PATCH /intervention-types/:id` — modifier un type (US14)

Mêmes champs que la création, tous facultatifs. Modifier la durée par défaut ne change pas les interventions déjà créées.

Réponse `200` : l'objet Type d'intervention mis à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Champ invalide |
| `401` | Non connecté |
| `403` | Rôle autre qu'ADMIN |
| `404` | Type inexistant |
| `409` | Libellé déjà utilisé |

### 6.5 Clients et adresses

Routes réservées à ADMIN et GEST. Toutes répondent `401` sans connexion et `403` pour un technicien ; ces deux cas ne sont pas répétés dans les tableaux.

L'objet **Client** :

```json
{
  "id": 8,
  "typeClient": "PARTICULIER",
  "nomClient": "Dupont",
  "prenomClient": "Jean",
  "raisonSociale": null,
  "nomAffiche": "Jean Dupont",
  "telephone": "0692123456",
  "emailClient": "jean.dupont@exemple.re",
  "archive": false,
  "archiveLe": null,
  "creeLe": "2026-11-20T06:00:00.000Z",
  "majLe": "2026-11-20T06:00:00.000Z",
  "adresses": [
    { "id": 15, "rue": "12 rue des Lilas", "complement": "Bât. B", "codePostal": "97400", "ville": "Saint-Denis", "infosAcces": "Code 4521, 3e étage", "archive": false, "archiveLe": null }
  ]
}
```

`nomAffiche` est calculé par l'API : prénom et nom pour un particulier, raison sociale pour un professionnel.

**Règles de validation communes** :

| Champ | Règle |
| --- | --- |
| `typeClient` | `PARTICULIER` ou `PROFESSIONNEL` |
| `nomClient` | Obligatoire pour un particulier, 1 à 100 caractères |
| `prenomClient` | Facultatif, 1 à 100 caractères |
| `raisonSociale` | Obligatoire pour un professionnel, 1 à 150 caractères |
| `telephone` | Obligatoire ; 10 chiffres commençant par 0 ; les espaces et les points sont acceptés puis retirés (`06 92 12 34 56` devient `0692123456`) |
| `emailClient` | Facultatif, format e-mail, 255 caractères maximum |
| `rue` | Obligatoire, 1 à 255 caractères |
| `complement` | Facultatif, 255 caractères maximum |
| `codePostal` | Obligatoire, 5 chiffres |
| `ville` | Obligatoire, 1 à 100 caractères |
| `infosAcces` | Facultatif, 500 caractères maximum (code, étage, interphone) |

#### `GET /clients` — rechercher et lister (US08)

| Paramètre | Validation |
| --- | --- |
| `page`, `limit` | Voir section 4 |
| `recherche` | 2 caractères minimum ; sur le nom, le prénom, la raison sociale, le téléphone et la ville ; insensible à la casse et aux accents |
| `typeClient` | `PARTICULIER` ou `PROFESSIONNEL` |
| `archives` | `true` pour inclure les clients archivés ; par défaut `false` |
| `tri` | Par défaut : `nomAffiche` croissant |

Réponse `200` : liste paginée d'objets Client, avec leurs adresses non archivées.

| Erreur | Cas |
| --- | --- |
| `400` | Paramètre invalide ; recherche de moins de 2 caractères |

#### `POST /clients` — créer un client (US06)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `typeClient`, `nomClient`, `prenomClient`, `raisonSociale`, `telephone`, `emailClient` | voir règles communes | |
| `adresse` | objet | Obligatoire : `rue`, `complement`, `codePostal`, `ville`, `infosAcces` |

Le client et sa première adresse sont créés dans une même transaction : un client n'existe jamais sans adresse (RG21).

Réponse `201` : l'objet Client.

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou invalide ; nom absent pour un particulier ; raison sociale absente pour un professionnel ; adresse absente ou invalide |

#### `GET /clients/:id` — consulter un client (US06)

Réponse `200` : l'objet Client avec **toutes** ses adresses, archivées comprises. Un client archivé reste consultable, pour l'historique.

| Erreur | Cas |
| --- | --- |
| `404` | Client inexistant |

#### `PATCH /clients/:id` — modifier un client (US10)

Mêmes champs que la création, sauf `adresse`, tous facultatifs. Si `typeClient` change, la règle nom / raison sociale est vérifiée sur le résultat.

Réponse `200` : l'objet Client mis à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Champ invalide ; client archivé |
| `404` | Client inexistant |

#### `POST /clients/:id/archive` — archiver un client (US10)

Aucun corps. Réponse `200` : l'objet Client avec `archive` à `true`.

| Erreur | Cas |
| --- | --- |
| `400` | Client déjà archivé |
| `404` | Client inexistant |
| `409` | Le client a des interventions à planifier, planifiées ou en cours : elles doivent être terminées ou annulées d'abord |

Effets : `archiveLe` renseigné ; le client disparaît des listes et des recherches mais reste visible dans l'historique (RG22).

#### `GET /clients/:id/interventions` — historique d'un client (US09)

| Paramètre | Validation |
| --- | --- |
| `page`, `limit` | Voir section 4 |
| `statut` | Un ou plusieurs statuts séparés par des virgules |

Réponse `200` : liste paginée d'objets Intervention (section 6.3), de la plus récente à la plus ancienne, toutes adresses du client confondues.

| Erreur | Cas |
| --- | --- |
| `404` | Client inexistant |

#### `POST /clients/:id/addresses` — ajouter une adresse (US07)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `rue`, `complement`, `codePostal`, `ville`, `infosAcces` | voir règles communes | |

Réponse `201` : l'objet Adresse.

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou invalide ; client archivé |
| `404` | Client inexistant |

#### `PATCH /clients/:id/addresses/:addressId` — modifier une adresse (US07)

Mêmes champs, tous facultatifs. La modification sert à corriger une adresse (faute de frappe, nouveau code d'accès) ; un déménagement se traite en ajoutant une nouvelle adresse, pour ne pas modifier l'historique des interventions passées.

Réponse `200` : l'objet Adresse mis à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Champ invalide ; adresse archivée |
| `404` | Client inexistant ; adresse qui n'appartient pas à ce client |

#### `POST /clients/:id/addresses/:addressId/archive` — archiver une adresse (US07)

Aucun corps. Réponse `200` : l'objet Adresse avec `archive` à `true`.

| Erreur | Cas |
| --- | --- |
| `400` | Dernière adresse non archivée du client (RG21) ; adresse déjà archivée |
| `404` | Client inexistant ; adresse qui n'appartient pas à ce client |
| `409` | L'adresse a des interventions à planifier, planifiées ou en cours |

### 6.6 Techniciens et indisponibilités

Routes réservées à ADMIN et GEST. Toutes répondent `401` sans connexion et `403` pour un technicien ; ces deux cas ne sont pas répétés dans les tableaux.

L'objet **Technicien** :

```json
{
  "id": 2,
  "utilisateurId": 7,
  "nom": "Benali",
  "prenom": "Karim",
  "email": "karim.benali@plomberie-durand.fr",
  "compteActif": true,
  "telephone": "0692123456",
  "couleurPlanning": "#1E88E5",
  "archive": false,
  "archiveLe": null
}
```

Le nom, le prénom, l'e-mail et l'état du compte viennent du compte utilisateur lié : ils sont affichés ici mais se modifient par `PATCH /users/:id` (ADMIN). La fiche technicien ne contient que les données propres au technicien.

L'objet **Indisponibilité** : `{ "id": 4, "debut": "2026-11-27T04:00:00.000Z", "fin": "2026-11-28T15:00:00.000Z", "motif": "Congés" }`.

#### `GET /technicians` — lister les techniciens (US11)

| Paramètre | Validation |
| --- | --- |
| `page`, `limit` | Voir section 4 |
| `recherche` | Sur le nom et le prénom |
| `archives` | `true` pour inclure les techniciens archivés ; par défaut `false` |
| `tri` | Par défaut : nom croissant |

Réponse `200` : liste paginée d'objets Technicien.

| Erreur | Cas |
| --- | --- |
| `400` | Paramètre invalide |

#### `POST /technicians` — créer une fiche technicien (US11)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `utilisateurId` | entier | Obligatoire ; compte existant, actif, de rôle `TECHNICIEN` |
| `telephone` | texte | Obligatoire ; 10 chiffres commençant par 0, espaces et points retirés |
| `couleurPlanning` | texte | Facultatif, format `#RRGGBB` ; par défaut, une couleur de la palette non encore utilisée |

Réponse `201` : l'objet Technicien.

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou invalide ; compte inexistant, désactivé ou qui n'a pas le rôle `TECHNICIEN` |
| `409` | Le compte a déjà une fiche technicien (D02) |

#### `GET /technicians/:id` — consulter un technicien (US11)

Réponse `200` : l'objet Technicien. Un technicien archivé reste consultable.

| Erreur | Cas |
| --- | --- |
| `404` | Technicien inexistant |

#### `PATCH /technicians/:id` — modifier un technicien (US11)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `telephone` | texte | Facultatif ; même règle qu'à la création |
| `couleurPlanning` | texte | Facultatif, format `#RRGGBB` |

Réponse `200` : l'objet Technicien mis à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Champ invalide ou non modifiable ici (`nom`, `email`…) ; technicien archivé |
| `404` | Technicien inexistant |

#### `POST /technicians/:id/archive` — archiver un technicien (US11)

Aucun corps. Réponse `200` : l'objet Technicien avec `archive` à `true`.

| Erreur | Cas |
| --- | --- |
| `400` | Technicien déjà archivé |
| `404` | Technicien inexistant |
| `409` | Le technicien a des interventions planifiées ou en cours, aujourd'hui ou plus tard : elles doivent être retirées de ses tournées d'abord |

Effets : `archiveLe` renseigné ; aucune nouvelle tournée ne peut lui être créée (RG08) ; il disparaît du planning mais reste visible dans l'historique (RG22). Son compte n'est pas désactivé : c'est une action distincte de l'administrateur (`POST /users/:id/deactivate`).

#### `GET /technicians/:id/unavailabilities` — lister les indisponibilités (US12)

| Paramètre | Validation |
| --- | --- |
| `du`, `au` | Dates `AAAA-MM-JJ`, facultatives ; par défaut, les indisponibilités en cours et à venir |

Réponse `200` : liste d'objets Indisponibilité, triée par date de début (non paginée).

| Erreur | Cas |
| --- | --- |
| `400` | Date invalide |
| `404` | Technicien inexistant |

#### `POST /technicians/:id/unavailabilities` — ajouter une indisponibilité (US12)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `debut` | date-heure | Obligatoire, ISO 8601 avec fuseau |
| `fin` | date-heure | Obligatoire, ISO 8601 avec fuseau, après `debut` |
| `motif` | texte | Facultatif, 255 caractères maximum |

Réponse `201` : l'objet Indisponibilité.

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou invalide ; fin antérieure ou égale au début ; technicien archivé |
| `404` | Technicien inexistant |
| `409` | Période qui recouvre une intervention planifiée ou en cours du technicien, citée dans le message (RG10) ; période qui recouvre une autre indisponibilité |

Une indisponibilité ne peut pas être posée sur une intervention déjà planifiée : le gestionnaire doit d'abord la retirer de la tournée ou la déplacer. C'est la même règle que l'affectation (`POST /tours/:id/interventions`), appliquée dans l'autre sens.

#### `DELETE /technicians/:id/unavailabilities/:unavailabilityId` — supprimer une indisponibilité (US12)

Réponse `204`.

| Erreur | Cas |
| --- | --- |
| `400` | Indisponibilité déjà terminée : elle est conservée dans l'historique |
| `404` | Technicien inexistant ; indisponibilité qui n'appartient pas à ce technicien |

### 6.7 Tournées et planning

Ces routes sont développées (card #19). Toutes répondent `401` sans connexion et `403` pour un rôle non autorisé ; ces deux cas ne sont pas répétés dans les tableaux.

L'objet **Tournée** :

```json
{
  "id": 5,
  "dateTournee": "2026-11-25",
  "technicien": { "id": 2, "nom": "Benali", "prenom": "Karim", "telephone": "0692123456", "couleurPlanning": "#1E88E5" },
  "interventions": [ "… objets Intervention (section 6.3), triés par ordreTournee …" ]
}
```

#### `GET /tours` — planning sur une période (US23)

| Paramètre | Validation |
| --- | --- |
| `du`, `au` | Dates `AAAA-MM-JJ`, à fournir ensemble ; 31 jours maximum ; par défaut, la semaine en cours (lundi à samedi) |
| `technicienId` | Entier ; facultatif |

Réponse `200` : le planning de **tous les techniciens actifs**, y compris ceux sans tournée, pour faire apparaître les créneaux libres.

```json
{
  "du": "2026-11-23",
  "au": "2026-11-28",
  "techniciens": [
    {
      "id": 2, "nom": "Benali", "prenom": "Karim", "telephone": "0692123456", "couleurPlanning": "#1E88E5",
      "indisponibilites": [ { "id": 4, "debut": "2026-11-27T04:00:00.000Z", "fin": "2026-11-28T15:00:00.000Z", "motif": "Congés" } ],
      "tournees": [ { "id": 5, "dateTournee": "2026-11-25", "interventions": [] } ]
    }
  ]
}
```

| Erreur | Cas |
| --- | --- |
| `400` | Une seule des deux dates ; date invalide ; période de plus de 31 jours ; paramètre inconnu |

#### `POST /tours` — créer une tournée (US20)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `technicienId` | entier | Obligatoire |
| `dateTournee` | date | Obligatoire, `AAAA-MM-JJ` |

Réponse `201` : l'objet Tournée, sans intervention.

| Erreur | Cas |
| --- | --- |
| `400` | Champ manquant ou invalide ; technicien inexistant, archivé ou dont le compte est désactivé (RG08) ; date passée (RG12) ; dimanche (RG11) |
| `409` | Le technicien a déjà une tournée ce jour-là (RG08) |

#### `GET /tours/:id` — consulter une tournée (US23)

Réponse `200` : l'objet Tournée.

| Erreur | Cas |
| --- | --- |
| `404` | Tournée inexistante |

#### `GET /tours/me/today` — ma tournée du jour (US24)

Droits : TECH uniquement. Le technicien est identifié par son jeton, jamais par un paramètre.

Réponse `200` : l'objet Tournée du jour. Réponse `204` (sans contenu) s'il n'a pas de tournée aujourd'hui : ce n'est pas une erreur.

| Erreur | Cas |
| --- | --- |
| `404` | Aucune fiche technicien n'est liée au compte |

#### `POST /tours/:id/interventions` — affecter une intervention (US21)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `interventionId` | entier | Obligatoire |
| `debutPrevu` | date-heure | Obligatoire, ISO 8601 avec fuseau |
| `ordreTournee` | entier | Facultatif, de 1 au nombre d'interventions + 1 ; par défaut, en dernier |

Réponse `200` : l'objet Tournée à jour. Le code est `200` et non `201` : aucune ressource n'est créée, l'intervention existante est planifiée.

| Erreur | Cas |
| --- | --- |
| `400` | Champ invalide ; intervention inexistante ; intervention qui n'est pas « à planifier » (RG02) ; tournée passée ; créneau hors de 7 h – 19 h (RG11) ; rang hors limites ; insertion avant une intervention « en cours » ou « terminée » (RG15, RG16) |
| `404` | Tournée inexistante |
| `409` | Chevauchement avec une autre intervention du technicien, citée dans le message (RG09) ; technicien indisponible sur le créneau (RG10) |

Effets, dans une transaction qui verrouille la tournée et l'intervention : l'intervention passe à `PLANIFIEE` avec son début prévu et son rang ; les interventions suivantes sont décalées d'un rang ; journal `STATUT_MODIFIE`. Le verrou empêche deux gestionnaires de créer un chevauchement en affectant au même moment.

#### `DELETE /tours/:id/interventions/:interventionId` — retirer une intervention (US21)

Réponse `200` : l'objet Tournée à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Intervention qui n'est pas « planifiée » (RG04, RG15) |
| `404` | Tournée inexistante ; intervention qui n'est pas dans cette tournée |

Effets, dans une transaction : l'intervention revient à `A_PLANIFIER`, sans début prévu ni rang ; les interventions suivantes remontent d'un rang ; journal `STATUT_MODIFIE`.

#### `PUT /tours/:id/order` — réordonner une tournée (US22)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `interventionIds` | liste d'entiers | Obligatoire ; exactement les interventions de la tournée, chacune une seule fois, dans le nouvel ordre ; 100 au maximum |

Réponse `200` : l'objet Tournée à jour.

| Erreur | Cas |
| --- | --- |
| `400` | Liste vide, invalide ou avec doublon (TI14) ; liste qui ne correspond pas aux interventions de la tournée ; intervention « en cours » ou « terminée » qui change de place (RG15, RG16) |
| `404` | Tournée inexistante |

Effets : nouveaux rangs enregistrés dans une seule transaction (RG14).

#### `POST /tours/:id/urgent-insertions` — insérer une urgence (US25, à développer)

| Champ envoyé | Type | Validation |
| --- | --- | --- |
| `interventionId` | entier | Obligatoire ; intervention « à planifier » |
| `ordreTournee` | entier | Obligatoire ; rang d'insertion |
| `debutPrevu` | date-heure | Obligatoire, ISO 8601 avec fuseau |

Avec `?simulation=true` : réponse `200` avec la tournée telle qu'elle serait après insertion, les interventions décalées étant signalées ; rien n'est enregistré. Sans ce paramètre : le décalage validé par le gestionnaire est appliqué, avec les mêmes contrôles et effets que l'affectation.

### 6.8 Tableau de bord

Toutes les routes répondent `401` sans connexion et `403` pour un rôle non autorisé ; ces deux cas ne sont pas répétés dans les tableaux. Les deux premières routes exposent les requêtes SQL écrites à la main (card #21) : les noms des champs sont ceux des colonnes de ces requêtes.

#### `GET /dashboard/activity` — interventions par technicien et par statut (US26)

Droits : ADMIN, GEST.

| Paramètre | Validation |
| --- | --- |
| `du`, `au` | Dates `AAAA-MM-JJ` (jours à La Réunion), `au` postérieur ou égal à `du` ; par défaut, le mois en cours |

La période porte sur la **date de la tournée**. Tous les techniciens non archivés apparaissent, y compris ceux sans tournée sur la période (compteurs à zéro).

Réponse `200` :

```json
{
  "du": "2026-11-01",
  "au": "2026-11-30",
  "techniciens": [
    { "idTechnicien": 2, "nom": "Benali", "prenom": "Karim", "total": 48, "aPlanifier": 0, "planifiees": 6, "enCours": 1, "terminees": 39, "annulees": 2 }
  ]
}
```

| Erreur | Cas |
| --- | --- |
| `400` | Date invalide ; `au` antérieur à `du` |

#### `GET /dashboard/processing-time` — temps moyen de traitement (US27)

Droits : ADMIN.

| Paramètre | Validation |
| --- | --- |
| `du`, `au` | Dates `AAAA-MM-JJ` (jours à La Réunion) ; par défaut, le mois en cours |

Ne compte que les interventions **terminées** sur la période (date de fin). La durée mesurée est le temps passé sur place, du démarrage à la fin, comparé à la durée estimée.

Réponse `200` :

```json
{
  "du": "2026-11-01",
  "au": "2026-11-30",
  "parType": [
    { "typeIntervention": "Fuite", "nombreInterventions": 21, "dureeMoyenneMin": 52, "dureeEstimeeMoyenneMin": 60 }
  ],
  "ensemble": { "nombreInterventions": 39, "dureeMoyenneMin": 71, "dureeEstimeeMoyenneMin": 75 }
}
```

La ligne `ensemble` est calculée sur toutes les interventions (`GROUP BY ROLLUP`), et non comme une moyenne des moyennes par type. `dureeMoyenneMin` vaut `null` s'il n'y a aucune intervention terminée.

| Erreur | Cas |
| --- | --- |
| `400` | Date invalide ; `au` antérieur à `du` |

#### `GET /dashboard/alerts` — interventions à traiter en priorité (US28)

Droits : ADMIN, GEST. Aucun paramètre.

Réponse `200` : trois listes d'objets Intervention (section 6.3), chacune limitée à 50 éléments.

| Liste | Contenu | Tri | Règle |
| --- | --- | --- | --- |
| `urgencesNonPlanifiees` | Interventions `URGENTE` à planifier depuis plus de 4 h | Plus ancienne d'abord | RG19 |
| `enAttente` | Interventions à planifier depuis plus de 48 h | Plus ancienne d'abord | US28 |
| `enRetard` | Interventions planifiées non démarrées 15 minutes après leur début prévu | Début prévu croissant | RG20 |

```json
{
  "urgencesNonPlanifiees": [ "… objets Intervention …" ],
  "enAttente": [],
  "enRetard": []
}
```

Une intervention urgente en attente depuis plus de 48 h apparaît dans les deux premières listes.

### 6.9 Écarts de la mise en œuvre des clients et des techniciens (#15)

Points que le contrat ne fixait pas, ou qu'il fixait autrement, tranchés à l'implémentation.

| Route | Écart |
| --- | --- |
| `GET /clients` | `tri` accepte `nomAffiche` (par défaut), `-nomAffiche`, `creeLe` et `-creeLe` ; toute autre valeur répond `400` |
| `GET /technicians` | `tri` accepte `nom` (par défaut) et `-nom` ; toute autre valeur répond `400` |
| `PATCH /clients/:id`, `PATCH /clients/:id/addresses/:addressId` | `null` efface un champ facultatif (`prenomClient`, `emailClient`, `complement`, `infosAcces`, et `nomClient` ou `raisonSociale` si la règle selon le type de client le permet). Une chaîne vide, ou faite seulement d'espaces, répond `400` au lieu d'effacer le champ. `null` sur un champ obligatoire (`rue`, `ville`, `telephone`…) répond `400` |
| `POST /technicians/:id/archive` | Une intervention `EN_COURS` bloque l'archivage (`409`) **quelle que soit sa date**, même d'un jour passé ; une intervention `PLANIFIEE` ne le bloque que si sa tournée a lieu aujourd'hui ou plus tard |
| `DELETE /technicians/:id/unavailabilities/:unavailabilityId` | `400` seulement si l'indisponibilité est terminée (sa fin est passée) ; une indisponibilité en cours peut encore être supprimée |

## 7. Points ouverts

- [x] **Routes d'Arnaud** : routes des sections 5.5 à 5.8 validées par le binôme.
- [x] **Détail des routes** : sections 6.1 à 6.8 rédigées.
- [ ] **Compteurs du tableau de bord** : la requête de `GET /dashboard/activity` ne compte que les interventions rattachées à une tournée ; `aPlanifier` et `annulees` restent donc à 0 (une intervention à planifier n'a pas de tournée, une intervention annulée en est retirée). Compter ces deux statuts à part, ou les retirer de la réponse.
- [ ] **Délai de traitement (US27)** : la user story parle du délai entre la demande et la fin d'intervention, la requête mesure le temps passé sur place. Choisir l'indicateur, ou garder les deux.
- [ ] **E-mail de réinitialisation** (US04) : ajouter Mailpit au `docker-compose.yml` pour capturer les e-mails en développement (card #7).
- [ ] **Durée d'une intervention** : limites de 15 à 720 minutes à confirmer.
- [ ] **Démarrage d'une intervention** : uniquement le jour de sa tournée ; à ajouter aux règles de gestion si la règle est retenue.
- [x] **Swagger** : documentation interactive sur `/api/docs`, désactivée en production. Les corps de requête sont décrits à la main (`@ApiBody`) tant que la validation n'utilise pas de classes DTO.