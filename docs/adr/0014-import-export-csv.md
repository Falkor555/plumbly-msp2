# 0014. Import et export CSV des clients et des interventions

- **Statut** : Proposée
- **Date** : 2026-11-25
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

À la mise en place de Plumbly, la gestionnaire doit reprendre une base de clients tenue dans un tableur (US31). Elle veut aussi sortir la liste des clients (US32) et la liste filtrée des interventions (US29) pour les relire ou les archiver dans Excel ou LibreOffice.

Contraintes :

- aucune nouvelle dépendance sans accord du binôme ; la validation des entrées est écrite à la main (`commun/validation.ts`), sans classes DTO ;
- un client n'a pas de contrainte d'unicité en base, ni sur le téléphone ni sur l'e-mail (RG23 ne concerne que les comptes) ;
- Express refuse par défaut un corps JSON de plus de 100 Ko, et un test d'intégration le vérifie sur la clôture signée (US33) ;
- un fichier CSV est une donnée venue de l'extérieur : il peut contenir une formule (« CSV Injection ») ou du texte qui ressemble à du SQL.

## Décision

1. **CSV écrit et lu à la main**, sans dépendance, dans `backend/src/commun/csv/` (écriture : BOM, `;`, CRLF, guillemets RFC 4180, neutralisation des formules par une apostrophe ; lecture : RFC 4180, détection du séparateur), avec des tests unitaires dont un aller-retour.
2. **Le fichier est envoyé en JSON** (`{ "contenu": "<texte du fichier>", … }`) : le navigateur le lit avec `File.text()`. Le corps JSON est relevé à 1,5 Mo pour les deux routes d'import seulement ; les autres routes gardent 100 Ko.
3. **Deux routes sans état** : `POST /clients/import/analysis` (aperçu, rien n'est écrit) puis `POST /clients/import`, qui refait toute l'analyse. Rien n'est gardé entre les deux appels.
4. **Une transaction et un verrou consultatif** : l'import prend `pg_advisory_xact_lock` au début de sa transaction (10 s au plus, sinon `409`), relit les doublons après l'avoir obtenu, puis enregistre toutes les lignes valides ; une erreur de la base annule tout (RG29).
5. **Export construit en mémoire**, 5 000 lignes au plus (moins d'1 Mo), à partir des requêtes de liste existantes : mêmes filtres, même tri.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| CSV fait main, sans dépendance (retenue) | Environ 150 lignes testées ; une seule implémentation, côté serveur, là où la validation compte | Code à maintenir ; pas de prise en charge d'Excel `.xlsx` |
| Papa Parse (front) ou csv-parse (back) | Bibliothèques éprouvées | Dépendance de plus ; Papa Parse ne servirait qu'au front, alors que le serveur doit tout revalider |
| JSON avec le texte du fichier (retenue) | Validation manuelle inchangée ; testable simplement avec supertest | Limite du corps à relever pour deux routes ; un fichier très riche en guillemets peut dépasser 1,5 Mo |
| `multipart/form-data` avec multer | Format standard d'envoi de fichier | multer et `@types/multer` à ajouter ; validation et tests plus lourds |
| Deux routes sans état (retenue) | Aucune donnée importée stockée en attente ; l'import ne fait pas confiance à l'aperçu | Le fichier est envoyé et analysé deux fois |
| Table d'import temporaire (analyse, puis validation par identifiant) | Un seul envoi du fichier | Données personnelles stockées en attente, à purger ; une migration et un état de plus |
| Verrou consultatif PostgreSQL (retenue) | Aucune migration ; deux imports passent l'un après l'autre | Ne protège pas d'un `POST /clients` simultané qui créerait le même client |
| Contrainte d'unicité sur le téléphone ou l'e-mail | Garantie en base | Refuserait des données existantes (deux clients d'une même famille partagent un téléphone) ; migration |

## Conséquences

- **Positives** : aucune dépendance ajoutée ; formules neutralisées dans tous les exports ; un export réimporté ne crée aucun client ; l'import est atomique et ne peut pas créer un client deux fois même lancé deux fois en même temps.
- **Négatives** : la limite de 1 000 lignes oblige à découper une grosse base ; le verrou ne sérialise que les imports entre eux ; une mise à jour verrouille les clients concernés jusqu'à la fin de l'import (quelques secondes), ce qui fait attendre une modification de leur fiche ; une erreur de la base n'est journalisée que par ses codes et le nom de la contrainte, pour ne pas écrire la ligne du fichier dans les logs.
- **À faire** : boutons « Importer un CSV » et « Exporter en CSV » sur la page Clients (#16), bouton d'export sur la liste des interventions (#18) ; limiteur de débit avec `@nestjs/throttler` (#13) ; import des types d'intervention (Could).
