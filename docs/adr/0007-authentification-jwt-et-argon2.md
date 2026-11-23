# 0007. Authentification par JWT et hachage argon2

- **Statut** : Acceptée
- **Date** : 2026-11-23
- **Décideurs** : Loïc BOTSY, Arnaud BIDEL

## Contexte

Trois rôles (administrateur, gestionnaire, technicien) ont des droits différents. Le front-end est une SPA séparée de l'API. Les techniciens utilisent l'application sur smartphone, parfois sur des réseaux peu fiables. Les deux CCP exigent une application **sécurisée**, dans le respect du Top 10 OWASP.

## Décision

- Mots de passe hachés avec **argon2** ; jamais stockés ni journalisés en clair.
- Authentification par **jeton d'accès JWT** de courte durée (15 minutes), envoyé dans l'en-tête `Authorization`.
- **Jeton de rafraîchissement** dans un cookie `httpOnly`, `Secure`, `SameSite=Strict`, renouvelé à chaque utilisation.
- Contrôle d'accès dans NestJS : un guard JWT puis un guard de rôles sur chaque route ; un technicien n'accède qu'à ses propres interventions.
- Limitation des tentatives de connexion avec `@nestjs/throttler`.

## Alternatives envisagées

| Option | Avantages | Inconvénients |
| --- | --- | --- |
| JWT court + rafraîchissement en cookie `httpOnly` | API sans état, adaptée à une SPA ; le jeton de rafraîchissement n'est pas lisible en JavaScript (protection XSS) | Gestion du renouvellement côté front |
| Sessions serveur avec cookie | Révocation immédiate | État à stocker côté serveur |
| JWT longue durée dans le `localStorage` | Très simple | Vulnérable au vol par XSS, impossible à révoquer |
| bcrypt au lieu d'argon2 | Très répandu | Argon2 est la recommandation actuelle de l'OWASP |

## Conséquences

- **Positives** : sécurité conforme aux recommandations OWASP ; droits vérifiés côté serveur pour chaque requête.
- **Négatives** : un jeton d'accès volé reste valable jusqu'à 15 minutes.
- **À faire** : développer le module dans la card #13 et les routes protégées dans la card #14 ; tester les accès refusés (TI01, TI02, TI07).
