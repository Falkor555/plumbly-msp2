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
| Dates et heures | ISO 8601 en UTC ; affichées à l'heure de Paris par le front | `"2026-11-24T08:00:00.000Z"` |
| Dates seules | ISO 8601 | `"2026-11-24"` |
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
  "client": { "id": 8, "nomAffiche": "Jean Dupont", "telephone": "0612345678" },
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

### 6.5 à 6.8 — Routes d'Arnaud (à détailler)

Les routes des clients, des techniciens, des tournées et du tableau de bord (sections 5.5 à 5.8) sont détaillées par Arnaud au même format que les sections 6.1 à 6.4 : données envoyées et validation, réponse, erreurs, effets.

Les règles suivantes concernent à la fois ses routes et celles des interventions. Elles sont fixées ici pour que les deux modules restent cohérents.

| Route d'Arnaud | Règle commune |
| --- | --- |
| `POST /tours/:id/interventions` | Corps : `interventionId`, `debutPrevu`, `ordreTournee` facultatif (sinon en dernier). L'intervention doit être `A_PLANIFIER`. Vérifie le chevauchement (RG09 : refus si début B < fin A et fin B > début A), l'indisponibilité (RG10) et les horaires (RG11). Erreur `409` en cas de conflit, avec l'intervention en conflit dans le message. Passe l'intervention à `PLANIFIEE` et écrit `STATUT_MODIFIE` dans le journal. |
| `DELETE /tours/:id/interventions/:interventionId` | Uniquement si l'intervention est `PLANIFIEE` (RG04, RG15). La remet à `A_PLANIFIER`, vide `debutPrevu` et `ordreTournee`, recalcule l'ordre des suivantes dans la même transaction et écrit `STATUT_MODIFIE`. |
| `PUT /tours/:id/order` | Corps : la liste complète des identifiants d'interventions dans le nouvel ordre. Exécuté dans une transaction (RG14) ; refusé (`400`) si une intervention `EN_COURS` ou `TERMINEE` change de place (RG15, RG16). |
| `GET /tours/me/today` et `GET /tours/:id` | Renvoient les interventions sous la forme de l'objet **Intervention** de la section 6.3, triées par `ordreTournee`. |
| `POST /tours/:id/urgent-insertions` | Paramètre `simulation=true` : renvoie le décalage proposé sans rien enregistrer ; sans ce paramètre, applique le décalage validé par le gestionnaire (US25). |

## 7. Points ouverts

- [x] **Routes d'Arnaud** : routes des sections 5.5 à 5.8 validées par le binôme.
- [ ] **Détail des routes d'Arnaud** : sections 6.5 à 6.8 à rédiger.
- [ ] **E-mail de réinitialisation** (US04) : ajouter Mailpit au `docker-compose.yml` pour capturer les e-mails en développement (card #7).
- [ ] **Durée d'une intervention** : limites de 15 à 720 minutes à confirmer.
- [ ] **Démarrage d'une intervention** : uniquement le jour de sa tournée ; à ajouter aux règles de gestion si la règle est retenue.
- [ ] **Swagger** : configurer la documentation sur `/api/docs` après l'initialisation de NestJS (card #8).