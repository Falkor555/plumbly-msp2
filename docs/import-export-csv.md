# Import et export CSV — Plumbly

Spécification fonctionnelle de l'import et de l'export CSV (issue #47). Le contrat des routes (corps, réponses, codes de retour) est dans le [contrat d'API](api.md), sections 6.12 et 6.13 ; les choix techniques sont dans l'[ADR 0014](adr/0014-import-export-csv.md) ; les règles RG25 à RG29 dans le [cahier des charges](cahier-des-charges.md#56-import-et-export).

## 1. Périmètre

| Priorité | Fonctionnalité | User story |
| --- | --- | --- |
| Should | Export CSV des interventions (liste filtrée) | US29, réécrite et passée de Could à Should |
| Should | Export CSV des clients | US32 (nouvelle) |
| Should | Import CSV des clients, avec aperçu, correspondance des colonnes et choix pour les doublons | US31 (nouvelle) |
| Could | Import des types d'intervention | Hors de ce lot |
| Hors MVP | Import des interventions historiques, import Excel `.xlsx` | — |

Ordre de réalisation recommandé : export (US29 et US32) d'abord, puis import (US31). L'export ne modifie aucune donnée ; l'import en crée et en modifie.

Numérotation : US29 existait déjà (« Export CSV », Could, sans card). US30 est réservée à l'IA, US33 à la signature du client. Les règles de gestion de ce lot sont RG25 à RG29 (la signature prend RG30 et suivantes). L'ADR du lot est l'ADR 0014 (0012 pour l'IA, 0013 pour la signature).

## 2. User stories

### US29 — Exporter les interventions en CSV · Should

**En tant que** gestionnaire ou administrateur, **je veux** exporter la liste des interventions filtrée en CSV **afin de** la suivre ou l'archiver dans un tableur.

- **Étant donné** une liste d'interventions filtrée (statut, urgence, technicien, client, période, recherche), **quand** je clique sur « Exporter en CSV », **alors** un fichier contenant uniquement les lignes filtrées, dans le même ordre, est téléchargé.
- **Étant donné** le fichier téléchargé, **quand** je l'ouvre dans Excel ou LibreOffice, **alors** les accents s'affichent correctement et chaque champ est dans sa colonne (RG26).
- **Étant donné** une description qui commence par `=`, `+`, `-` ou `@`, **quand** j'ouvre le fichier, **alors** le tableur l'affiche comme du texte et n'exécute aucune formule (RG26).
- **Étant donné** que je suis technicien, **quand** j'appelle l'export, **alors** l'accès est refusé (403) (RG25).
- **Étant donné** un export réussi, **alors** le journal des actions enregistre qui a exporté, quoi et combien de lignes, sans aucune donnée de client (RG25).
- **Étant donné** des filtres qui donnent plus de 5 000 interventions, **quand** j'exporte, **alors** l'export est refusé avec un message qui demande d'affiner les filtres (RG26).

### US31 — Importer des clients depuis un fichier CSV · Should

**En tant que** gestionnaire, **je veux** importer une liste de clients depuis un fichier CSV **afin d'**éviter de ressaisir une base existante à la mise en place de Plumbly.

- **Étant donné** un fichier CSV UTF-8 de 1 Mo et 1 000 lignes au plus, **quand** je le choisis, **alors** l'application affiche les en-têtes, les 10 premières lignes et la correspondance proposée entre les colonnes et les champs client, sans rien enregistrer.
- **Étant donné** des en-têtes comme « Tel », « Mobile » ou « Courriel », **alors** la correspondance proposée les rattache au bon champ, et je peux la modifier.
- **Étant donné** une correspondance où il manque un champ obligatoire (téléphone, rue, code postal, ville, et nom ou raison sociale), **alors** l'import est impossible et l'application dit lequel manque.
- **Étant donné** des lignes invalides, **alors** chacune est listée avec son numéro de ligne dans le fichier et la raison du rejet, et elle n'empêche pas l'import des autres (RG27).
- **Étant donné** une ligne dont le téléphone ou l'e-mail correspond à un client existant, ou à une ligne précédente du fichier, **alors** elle est signalée comme doublon dans l'aperçu (RG28).
- **Étant donné** des doublons, **quand** je lance l'import, **alors** je choisis explicitement de les ignorer (par défaut) ou de mettre à jour les clients existants ; aucun client n'est créé en double, et aucune donnée existante n'est effacée (RG28).
- **Étant donné** un import lancé, **alors** un rapport donne le nombre de clients créés, mis à jour, ignorés et rejetés, avec le détail par ligne.
- **Étant donné** une erreur de la base pendant l'enregistrement, **alors** aucun client du fichier n'est enregistré (RG29).
- **Étant donné** un import réussi, **alors** le journal enregistre l'auteur et les compteurs, sans nom, téléphone ni e-mail (RG25).
- **Étant donné** que je suis technicien, **alors** l'accès est refusé (403).

### US32 — Exporter les clients en CSV · Should

**En tant que** gestionnaire ou administrateur, **je veux** exporter les clients en CSV **afin de** les relire, les sauvegarder ou les transmettre à un autre outil.

- **Étant donné** la liste des clients filtrée (recherche, type, archivés), **quand** je clique sur « Exporter en CSV », **alors** un fichier avec une ligne par adresse non archivée de chaque client est téléchargé.
- **Étant donné** ce fichier, **quand** je le réimporte sans le modifier, **alors** toutes les lignes sont reconnues comme doublons : les colonnes de l'export sont reconnues par l'import.
- Mêmes critères que US29 pour l'encodage, la neutralisation des formules, les droits, la limite de 5 000 lignes et le journal.

## 3. Règles de gestion

| RG | Règle |
| --- | --- |
| RG25 | L'import et l'export CSV sont réservés aux administrateurs et aux gestionnaires. Chaque import et chaque export réussi est journalisé dans MongoDB avec l'auteur, la ressource, les compteurs et le nom des filtres utilisés, jamais leurs valeurs ni une donnée de client. |
| RG26 | Un export est encodé en UTF-8 avec BOM, séparé par des points-virgules, avec des fins de ligne CRLF et des guillemets selon la RFC 4180. Toute cellule de texte qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est précédée d'une apostrophe. Un export est limité à 5 000 lignes. |
| RG27 | Un fichier importé est un CSV UTF-8 de 1 Mo et 1 000 lignes de données au plus, avec une ligne d'en-têtes. Chaque ligne est validée avec les règles de la création d'un client (US06, RG21). Une ligne invalide est rejetée sans bloquer les autres. |
| RG28 | Une ligne est un doublon si son téléphone (normalisé) ou son e-mail (sans tenir compte de la casse) est celui d'un client existant ou d'une ligne précédente du fichier. Un doublon n'est jamais créé. Selon le choix explicite de l'utilisateur, il est ignoré (par défaut) ou met à jour le client existant ; une mise à jour n'efface aucune valeur et ne touche jamais un client archivé. |
| RG29 | Les lignes valides d'un import sont enregistrées dans une seule transaction : en cas d'erreur, aucune n'est gardée. Deux imports ne s'exécutent jamais en même temps. |

## 4. Format des fichiers

### 4.1 Export des clients (US32)

Une ligne par adresse non archivée ; un client avec deux adresses donne deux lignes. Les noms de colonnes sont ceux que l'import reconnaît.

```csv
id;type_client;nom;prenom;raison_sociale;telephone;email;rue;complement;code_postal;ville;infos_acces;archive;cree_le
8;PARTICULIER;Dupont;Marie;;0692123456;marie.dupont@exemple.re;12 rue des Manguiers;;97400;Saint-Denis;Code 4521;non;2026-11-20
9;PROFESSIONNEL;;;Boulangerie Hoarau;0262987654;;8 avenue de la Victoire;Local 2;97410;Saint-Pierre;;non;2026-11-21
```

- `cree_le` est le jour de création à l'heure de La Réunion (`AAAA-MM-JJ`).
- `archive` vaut `oui` ou `non` ; les clients archivés ne sont exportés qu'avec le filtre `archives=true`.
- Un client archivé dont toutes les adresses sont archivées sort sur une ligne, colonnes d'adresse vides.

### 4.2 Export des interventions (US29)

```csv
id;cree_le;client;code_postal;ville;type_intervention;description;urgence;statut;duree_estimee_min;debut_prevu;technicien;ordre_tournee;terminee_le;signee
12;2026-11-24;Marie Dupont;97400;Saint-Denis;Chauffe-eau;Plus d'eau chaude;URGENTE;PLANIFIEE;90;2026-11-27 08:00;Karim Payet;1;;non
```

- `client` est le nom affiché (prénom et nom, ou raison sociale), `technicien` le prénom et le nom du technicien de la tournée.
- Les dates et heures sont à l'heure de La Réunion (`AAAA-MM-JJ` et `AAAA-MM-JJ HH:MM`).
- Ne sont **pas** exportés, par minimisation (RGPD) : le téléphone et l'e-mail du client, la rue, les informations d'accès, le compte rendu, le motif d'annulation, et la signature du client (US33) : ni l'image, ni le nom du signataire, ni l'empreinte. Seule la colonne `signee` (`oui` / `non`) dit si le client a signé.

### 4.3 Import des clients (US31)

```csv
nom;prenom;email;telephone;adresse;code_postal;ville
DUPONT;Marie;marie.dupont@exemple.re;0692 12 34 56;12 rue des Manguiers;97400;Saint-Denis
HOARAU;Jean;jean.hoarau@exemple.re;0692 98 76 54;8 avenue de la Victoire;97410;Saint-Pierre
```

- Séparateur `;` ou `,`, détecté sur la ligne d'en-têtes (celui qui apparaît le plus hors des guillemets, `;` en cas d'égalité). L'utilisateur peut l'imposer.
- Guillemets RFC 4180 : un champ entre guillemets peut contenir le séparateur, des guillemets doublés (`""`) et des retours à la ligne.
- Les lignes vides sont ignorées. Une ligne qui n'a pas le même nombre de colonnes que l'en-tête est rejetée.
- Une cellule vide vaut « champ absent ». Une apostrophe placée devant `=`, `+`, `-` ou `@` est retirée : c'est l'inverse de la neutralisation de l'export.
- Un fichier qui n'est pas en UTF-8 (par exemple « CSV (séparateur : point-virgule) » d'Excel, encodé en Windows-1252) est refusé avec le message « Enregistrez le fichier au format CSV UTF-8 ». Le navigateur décode le fichier en UTF-8 : un caractère de remplacement `U+FFFD` dans le texte trahit un autre encodage.

**Champs et en-têtes reconnus.** La comparaison ignore la casse, les accents, les espaces, `_`, `-` et `.`.

| Champ client | En-têtes reconnus | Obligatoire |
| --- | --- | --- |
| `typeClient` | type, type_client | Non (voir ci-dessous) |
| `nomClient` | nom, nom_client | Pour un particulier |
| `prenomClient` | prenom, prenom_client | Non |
| `raisonSociale` | raison_sociale, societe, entreprise | Pour un professionnel |
| `telephone` | telephone, tel, mobile, portable, numero_de_contact | Oui |
| `emailClient` | email, e-mail, mail, courriel | Non |
| `rue` | rue, adresse, adresse_1 | Oui |
| `complement` | complement, adresse_2 | Non |
| `codePostal` | code_postal, cp | Oui |
| `ville` | ville, commune | Oui |
| `infosAcces` | infos_acces, acces, digicode | Non |

Les colonnes non reconnues (par exemple `id`, `archive` ou `cree_le` d'un export) sont ignorées et listées dans l'aperçu.

`typeClient` accepte `PARTICULIER` et `PROFESSIONNEL`, sans tenir compte de la casse. Sans colonne de type, ou si la cellule est vide, une ligne avec une raison sociale et sans nom est un professionnel ; toute autre ligne est un particulier.

**Précisions de la mise en œuvre.**

- Si deux colonnes se proposent pour le même champ (« Tel » et « Mobile »), la première le prend ; la seconde est proposée `null` et listée dans `colonnesIgnorees`. Un choix envoyé dans `correspondance` l'emporte sur la proposition d'une autre colonne ; seul un même champ choisi deux fois dans `correspondance` est refusé.
- Deux colonnes au même en-tête (y compris deux en-têtes vides) sont refusées : le message donne leurs numéros, pas l'en-tête.
- Une ligne faite seulement de séparateurs (`;;;`) est une ligne vide : elle est ignorée et ne compte pas dans la limite de 1 000 lignes.
- Un motif de rejet nomme le champ de la correspondance (`codePostal`), jamais la valeur de la cellule.

## 5. Parcours utilisateur

1. Sophie ouvre la page Clients et clique sur « Importer un CSV ».
2. Elle choisit un fichier `.csv`. Le navigateur lit le texte du fichier et l'envoie à l'API, qui l'analyse sans rien enregistrer.
3. L'écran affiche le séparateur détecté, les 10 premières lignes, une liste déroulante par colonne avec le champ proposé, et un résumé : lignes valides, doublons, lignes invalides avec leur numéro et leur motif.
4. Si elle change la correspondance ou le séparateur, l'analyse est relancée.
5. S'il y a des doublons, elle choisit « Ignorer les doublons » (coché par défaut) ou « Mettre à jour les clients existants ».
6. Elle clique sur « Importer ». L'API refait toute l'analyse (elle ne fait pas confiance au résultat de l'étape 2), puis enregistre les lignes valides.
7. Le rapport affiche les compteurs (créés, mis à jour, ignorés, rejetés) et le détail par ligne. La liste des clients est rechargée.

L'export est un bouton « Exporter en CSV » au-dessus de la liste des clients et de la liste des interventions. Il exporte avec les filtres affichés.

## 6. Doublons et mise à jour (RG28)

- La recherche des doublons porte sur **tous** les clients, archivés compris.
- Un doublon d'un client archivé est toujours ignoré, quelle que soit la stratégie, avec le motif « client archivé ».
- Une ligne dont le téléphone désigne un client et l'e-mail un autre est rejetée : « correspond à deux clients différents ».
- Dans le fichier, plusieurs lignes peuvent désigner le même client **existant** : chacune est un doublon de ce client (c'est le cas d'un export réimporté, une ligne par adresse). Pour un client **absent** de la base, la première ligne gagne et les suivantes sont rejetées : « doublon de la ligne N » ; sa deuxième adresse s'ajoute ensuite depuis la fiche du client.
- Mise à jour : seuls les champs d'identité non vides de la ligne remplacent ceux du client ; une cellule vide ne vide rien. Le type de client n'est changé que si la colonne de type est renseignée, et la règle nom / raison sociale (`verifierIdentite`) est vérifiée sur le client mis à jour. Si l'adresse de la ligne (rue, code postal et ville, sans tenir compte de la casse ni des espaces en trop) n'existe pas parmi ses adresses non archivées, elle est ajoutée. Aucune adresse n'est modifiée ni archivée.
- Seules les lignes valides comptent pour les doublons du fichier : une ligne invalide reste `INVALIDE` même si elle désigne un client existant, et ne réserve ni son téléphone ni son e-mail. L'aller-retour d'un export vaut donc pour les lignes qui ont une adresse, ce qui est toujours le cas d'un client créé par l'application.
- Une ligne dont le téléphone désigne un client existant et l'e-mail une ligne précédente du fichier est rejetée de la même façon : « correspond à deux clients différents ».
- Les doublons sont relus sous le verrou de l'import : l'aperçu ne décide de rien. Un client archivé entre-temps est ignoré.
- Une ligne mise à jour sort `MIS_A_JOUR` même si aucune valeur ne change ; seuls les champs qui diffèrent sont écrits.
- Un import réussi est journalisé même si aucune ligne n'est enregistrée.
- Le schéma ne prévoit pas d'état « à revoir » pour un client : l'option « signaler pour revue » de la proposition est remplie par l'aperçu, qui liste les doublons avant l'import, et par le rapport.

## 7. Sécurité

| Risque | Parade dans Plumbly |
| --- | --- |
| Formule exécutée à l'ouverture d'un export | Apostrophe devant les cellules de texte qui commencent par `=`, `+`, `-`, `@`, tabulation ou retour chariot (RG26, OWASP « CSV Injection ») |
| Données mal découpées | UTF-8 avec BOM, séparateur `;`, guillemets RFC 4180, CRLF |
| Injection SQL à l'import | Prisma et `$queryRaw` avec paramètres liés ; aucune valeur du fichier concaténée dans une requête |
| Données invalides en base | Chaque ligne passe par la validation de `POST /clients` (`lireNouveauClient`), y compris le refus du caractère NUL |
| Import massif | 1 Mo et 1 000 lignes au plus ; corps de requête refusé au-delà (413) ; un seul import à la fois (verrou PostgreSQL) |
| Écrasement de données | Pas de mise à jour sans choix explicite ; une mise à jour n'efface rien et ignore les clients archivés |
| Fuite de données | Routes ADMIN et GEST seulement, contrôlées côté serveur ; colonnes minimales pour les interventions ; export journalisé |
| Données personnelles dans le journal | Le journal ne garde que des compteurs, la ressource et le nom des filtres (la valeur de `recherche` peut être un nom de client) |
| Messages d'erreur | Les motifs de rejet nomment le champ et la règle, jamais la valeur saisie |
| Contenu du fichier pris pour une consigne | Le fichier est une donnée ; aucun traitement n'interprète son contenu |

## 8. Choix techniques ([ADR 0014](adr/0014-import-export-csv.md))

- **Pas de nouvelle dépendance.** Le découpage CSV (environ 80 lignes, RFC 4180) et l'écriture CSV sont écrits à la main dans `backend/src/commun/csv/`, testés unitairement. Papa Parse n'est pas ajouté : il ne servirait qu'au front, et la validation qui compte est côté serveur.
- **Le fichier est envoyé en JSON** (`{ "contenu": "<texte du fichier>", … }`) plutôt qu'en `multipart/form-data`. Le navigateur lit le fichier avec `File.text()`. Ce choix garde la validation manuelle de `commun/validation.ts`, évite multer et `@types/multer`, et se teste simplement avec supertest. Contrepartie : la limite du corps JSON d'Express (100 Ko par défaut) est relevée à 1,5 Mo pour les deux routes d'import seulement ; les autres routes gardent 100 Ko.
- **Deux routes sans état** : `POST /clients/import/analysis` (aperçu, aucune écriture) puis `POST /clients/import` (refait l'analyse et enregistre). Rien n'est stocké entre les deux appels.
- **Transaction unique et verrou** : l'import prend un verrou `pg_advisory_xact_lock` dans sa transaction et recherche les doublons après l'avoir pris. Sans contrainte d'unicité sur le téléphone ou l'e-mail d'un client, c'est ce qui empêche deux imports simultanés de créer le même client.
- **Journal** : deux nouvelles actions, `EXPORT_CSV` et `CLIENTS_IMPORTES`, rattachées à l'auteur (`entite: { type: "utilisateur", id: <auteur> }`), écrites après la transaction, sans bloquer.
- **Export construit en mémoire** : 5 000 lignes au plus, soit moins d'1 Mo ; pas de flux à gérer.
