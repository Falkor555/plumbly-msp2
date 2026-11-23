# 0004. Front-end React, Vite et Tailwind CSS

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

L'interface doit fonctionner sur ordinateur pour le gestionnaire et sur smartphone pour le technicien. Elle doit être accessible (RGAA), respecter la charte des maquettes Figma et être développée rapidement par deux personnes.

## Décision

Le front-end est une application monopage (SPA) en **React** et TypeScript, construite avec **Vite** et stylée avec **Tailwind CSS**. React Router gère les routes protégées ; TanStack Query (proposé) gère les appels à l'API et leur cache.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| React + Vite + Tailwind | Écosystème très répandu, démarrage et rechargement très rapides, charte appliquée via la configuration Tailwind, responsive simple | Classes nombreuses dans le JSX |
| Next.js | Rendu serveur, routage intégré | Rendu serveur inutile pour une application derrière une connexion ; ajoute un deuxième serveur Node à côté de NestJS |
| Angular | Cadre complet, proche de NestJS | Plus lourd à apprendre en deux semaines |
| CSS classique ou bibliothèque de composants (MUI) | Composants prêts à l'emploi pour MUI | Charte plus difficile à respecter fidèlement |

## Conséquences

- **Positives** : les maquettes se traduisent directement en classes Tailwind ; la vue mobile du technicien est simple à rendre responsive.
- **Négatives** : l'accessibilité des composants (modales, menus) doit être assurée par l'équipe.
- **À faire** : initialiser le projet et configurer Tailwind avec la charte dans la card #9.
