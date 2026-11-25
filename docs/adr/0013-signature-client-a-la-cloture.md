# 0013. Signature du client à la clôture d'une intervention

- **Statut** : Proposée
- **Date** : 2026-11-25
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

La gestionnaire ne sait aujourd'hui qu'une intervention a été faite que parce que le technicien l'a passée à « terminée ». Elle n'a aucune confirmation du client. L'US33 demande que le client puisse confirmer la réalisation en signant sur le mobile du technicien, au moment de la clôture.

Contraintes :

- la stack Docker Compose ne contient que PostgreSQL et MongoDB, sans stockage objet (S3, MinIO) ;
- le passage à « terminée » est décidé à un seul endroit (`interventions/cycle-de-vie.ts`) et réservé au technicien affecté (RG03) ;
- le compte rendu peut aujourd'hui être modifié après la clôture (US18) ;
- aucune nouvelle dépendance sans accord du binôme ; la validation des entrées est écrite à la main (`commun/validation.ts`) ;
- le jeton d'accès est gardé en mémoire et envoyé dans l'en-tête `Authorization` : une balise `<img src="/api/...">` ne l'enverrait pas.

## Décision

1. **Pas de nouvelle route de transition.** `POST /interventions/:id/complete` accepte un objet `signature` facultatif (`image` en data URL PNG, `nomSignataire`). La clôture et l'enregistrement de la signature se font dans **la même transaction PostgreSQL** ; la table des transitions ne change pas.
2. **Stockage dans PostgreSQL**, dans une table séparée `signature_intervention` (relation 0,1 avec `intervention`), colonne `image` en `BYTEA` limitée à 48 Ko par une contrainte `CHECK`. Les listes d'interventions ne lisent jamais cette colonne.
3. **Empreinte SHA-256** (module `node:crypto`) calculée par le serveur au moment de la signature, sur l'identifiant de l'intervention, le compte rendu, le nom du signataire, l'horodatage serveur, l'auteur et l'empreinte de l'image. Elle est recalculée à la lecture pour indiquer si le contenu signé est intact.
4. **Signature définitive** : un déclencheur PostgreSQL refuse toute mise à jour de `signature_intervention`, et le compte rendu d'une intervention signée ne se modifie plus (exception à US18).
5. **Lecture en JSON** : `GET /interventions/:id/signature` renvoie les métadonnées et l'image en data URL, affichée par une balise `<img>`.
6. **Signature électronique simple** au sens du règlement eIDAS : elle est présentée comme une confirmation de réalisation, jamais comme une signature qualifiée.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| Image en `BYTEA` dans PostgreSQL, table séparée (retenue) | Une seule transaction pour la clôture et la preuve ; sauvegarde unique ; aucun service ni dépendance en plus | Base plus lourde (quelques dizaines de Ko par intervention signée) ; à revoir si des photos sont ajoutées |
| Stockage objet MinIO ou S3 et URL signée | Standard pour des fichiers nombreux ou lourds | Nouveau service Docker, SDK à ajouter, cohérence entre deux systèmes à gérer, hors de portée du MVP |
| Fichier sur un volume Docker | Simple à écrire | Pas transactionnel, sauvegarde séparée, chemins à sécuriser |
| Image dans MongoDB | Base déjà présente | Écrite après la transaction PostgreSQL : une clôture pourrait exister sans sa preuve |
| Route dédiée `POST /interventions/:id/signature` qui termine aussi l'intervention | Route explicite | Deux routes pour la même transition ; risque de règles divergentes |
| Envoi `multipart/form-data` | Pas d'encodage base64 | Validation et tests plus lourds ; la signature n'est qu'une petite image |
| Signature papier scannée, lien de signature par e-mail, prestataire de signature qualifiée | Valeur de preuve plus forte (prestataire) | Ressaisie, dépendance à un service d'e-mail ou à un prestataire payant, hors MVP |

## Conséquences

- **Positives** : la clôture signée est atomique ; la gestionnaire distingue une intervention « terminée » d'une intervention « terminée et signée » ; aucune dépendance ni aucun service ajouté.
- **Négatives** : l'empreinte détecte une modification faite par l'application ou une erreur, pas une falsification par quelqu'un qui a un accès direct à la base et recalcule l'empreinte ; la vérification qu'une signature n'est pas vide est faite par le front (le serveur ne contrôle que la structure du PNG) ; rien n'empêche techniquement le technicien de signer à la place du client.
- **À faire** : migration Prisma (table, `CHECK`, déclencheur) ; validation du PNG dans `interventions.validation.ts` ; mise à jour de `docs/api.md`, du cahier des charges (RG30 à RG35, RGPD) et du modèle de données ; écran de clôture sur mobile (#18) ; évolutions possibles : empreinte HMAC avec une clé serveur, horodatage qualifié, export PDF du bon signé.
