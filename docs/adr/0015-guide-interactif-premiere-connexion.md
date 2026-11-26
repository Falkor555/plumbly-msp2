# 0015. Guide interactif à la première connexion, avec Driver.js

- **Statut** : Proposée
- **Date** : 2026-11-26
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Un nouvel utilisateur arrive sur Plumbly sans formation : la gestionnaire découvre le planning, le technicien sa tournée du jour sur son téléphone. Un court guide, lancé à la première connexion et adapté au rôle (ADMIN, GESTIONNAIRE, TECHNICIEN), lui montre les zones utiles de l'écran (US34).

Contraintes :

- aucune nouvelle dépendance sans accord du binôme ; une dépendance front doit rester légère, car le technicien travaille sur mobile, parfois en 4G ;
- le guide ne doit pas être relancé à chaque connexion, y compris quand l'utilisateur change d'appareil : l'état ne peut pas vivre dans le seul navigateur ;
- l'accessibilité : fermeture au clavier (`Échap`), focus qui revient à la page, contraste d'au moins 4,5:1 ;
- le module `/users/*` appartient à Loïc (#13) : on évite de modifier son contrôleur et son service.

## Décision

1. **Driver.js** (licence MIT, aucune dépendance, version exacte `1.14.0`) affiche le guide : surbrillance d'un élément, bulle, navigation entre étapes, `Échap`. Un seul fichier du front l'importe (`frontend/src/guide/moteurVisite.ts`) : le reste du code et les tests ne dépendent que de notre interface.
2. **Les étapes sont écrites dans le code**, par rôle (`frontend/src/guide/etapes.ts`), et ciblent des attributs stables `data-guide="…"`, jamais des classes Tailwind. Chaque parcours reste sur la page d'accueil du rôle (`/planning` ou `/ma-tournee`) : pas de changement de page pendant le guide.
3. **Une colonne `guide_vu_version`** (entier, nul par défaut) sur `utilisateur` retient la dernière version du guide vue. Le front connaît la version courante (`VERSION_GUIDE`) ; il lance le guide si la version vue est nulle ou plus petite. Pas de table dédiée ni de liste des étapes vues : une version suffit.
4. **Un module `guide` séparé** expose `GET /onboarding` et `PUT /onboarding` pour l'utilisateur connecté (les trois rôles). Il ne touche ni au contrôleur ni au service des utilisateurs ; seul le schéma Prisma est partagé.
5. **« Terminer » et « Passer le guide » enregistrent la version** : ce sont des choix explicites. Fermer la bulle (croix, `Échap`) reporte le guide au prochain chargement de l'application, sans rien enregistrer. Un bouton « Revoir le guide », dans la barre commune, le relance à tout moment.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| Driver.js (retenue) | MIT, sans dépendance, environ 15 Ko compressés ; `Échap` et flèches gérés, bulle repositionnée au défilement, élément absent ignoré (`skipMissingElement`), raison de fermeture fournie (`done`, `close`, `escape`) | Bibliothèque JavaScript sans composant React ; style à adapter à la charte |
| Shepherd.js | Complet, adaptateur React | Licence AGPL-3.0 (ou licence commerciale payante), qui imposerait de publier le code de Plumbly |
| React Joyride | Composants React, MIT | Dix dépendances (Floating UI, utilitaires de défilement…) pour le même service |
| Guide fait main | Aucune dépendance | Positionnement de bulle, défilement, redimensionnement et focus à réécrire et tester : plusieurs jours pour un résultat moins fiable |
| État dans `localStorage` | Aucune route, aucune migration | Guide relancé sur chaque nouvel appareil ou navigateur ; l'état n'est pas prouvable côté serveur |
| Champ dans `GET /users/me` | Une requête de moins à la connexion | Modifie le module de Loïc (#13) et le contrat 6.2 |

## Conséquences

- **Positives** : prise en main sans formation ; un nouveau guide se déclenche en augmentant `VERSION_GUIDE` (nouvelle fonctionnalité) ; une seule dépendance front, isolée derrière une interface.
- **Négatives** : une dépendance à suivre ; une requête de plus à la connexion ; les étapes doivent être tenues à jour quand un écran change (un test vérifie que chaque cible existe).
- **Accessibilité** : Driver.js 1.14 nomme déjà la bulle (`role="dialog"`, `aria-labelledby`), annonce chaque étape (`aria-live="polite"`) et fait tourner `Tab` entre la bulle et l'élément mis en évidence. On n'ajoute pas `aria-modal="true"` : l'élément mis en évidence est hors de la bulle et doit rester lisible par un lecteur d'écran. Le focus rendu à la page, l'arrêt du guide au démontage et la réduction des animations sont à notre charge.
- **À faire** : migration `guide_vu_version` ; module `guide` et deux routes dans `docs/api.md` et `securite.e2e-spec.ts` ; US34 et RG36, RG37 dans la documentation ; styles de la bulle dans `index.css` avec les jetons de la charte ; tests Vitest avec MSW.
