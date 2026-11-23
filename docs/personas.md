# Personas — Plumbly

Trois personas représentent les utilisateurs de Plumbly : le gestionnaire, le technicien et l'administrateur. Ils sont fictifs mais construits à partir du fonctionnement type d'une entreprise de plomberie de 3 à 20 techniciens. Ils servent de référence pour les [user stories](user-stories.md), les maquettes et les arbitrages de priorité.

| Persona | Rôle dans Plumbly | Support principal | Priorité de conception |
| --- | --- | --- | --- |
| Sophie, gestionnaire | Gestionnaire | Ordinateur de bureau | Persona principal |
| Karim, plombier | Technicien | Smartphone Android | Persona principal |
| Michel, gérant | Administrateur | Ordinateur portable, parfois smartphone | Persona secondaire |

Sophie et Karim sont les **personas principaux** : l'application doit d'abord leur faire gagner du temps au quotidien. Michel est un **persona secondaire** : ses besoins (comptes, statistiques) ne doivent pas compliquer les écrans des deux autres.

---

## Sophie Martin, gestionnaire planning

> « Ce qui me prend le plus de temps, ce n'est pas de noter les demandes, c'est de trouver qui peut y aller et quand. »

| | |
| --- | --- |
| **Âge** | 42 ans |
| **Poste** | Assistante de gestion, responsable du planning |
| **Entreprise** | Plomberie Durand, 8 techniciens, Lyon et sa périphérie |
| **Ancienneté** | 6 ans dans l'entreprise |
| **Aisance numérique** | Moyenne : utilise quotidiennement la messagerie, un tableur et le logiciel de facturation |
| **Équipement** | Ordinateur de bureau, deux écrans, téléphone fixe avec casque |

### Sa journée type

- **7 h 30** : relit les messages et les mails de la veille, rappelle les clients en attente.
- **8 h – 12 h** : reçoit 15 à 30 appels. Note chaque demande sur un cahier, puis la recopie dans un tableur partagé.
- **Toute la journée** : appelle les plombiers pour insérer les urgences, déplace des rendez-vous, prévient les clients des retards.
- **17 h** : prépare le planning du lendemain et l'envoie à chaque technicien par SMS.

### Objectifs

- Voir d'un coup d'œil la charge et les créneaux libres de chaque technicien.
- Insérer une urgence sans désorganiser toute la journée.
- Retrouver rapidement un client et l'historique de ses interventions.
- Ne plus envoyer le planning par SMS.

### Frustrations

- Les doubles réservations quand deux personnes modifient le tableur.
- Les plombiers qui appellent pour demander leur prochaine adresse.
- Les informations perdues entre le cahier, le tableur et les SMS.
- Ne pas savoir si une intervention est terminée sans téléphoner.

### Ce que Plumbly doit lui apporter

- Un planning jour / semaine par technicien, avec les conflits signalés automatiquement.
- Une saisie rapide des demandes, avec recherche du client par nom ou téléphone.
- Le statut de chaque intervention mis à jour par le technicien lui-même.
- Une liste des interventions non planifiées, urgences en tête.

### Critères d'ergonomie

- Travaille vite, au clavier, souvent pendant un appel : formulaires courts, navigation au clavier, recherche instantanée.
- Doit pouvoir corriger une erreur facilement : modification et annulation accessibles.

---

## Karim Benali, plombier chauffagiste

> « Le matin, je veux savoir où je vais. Dans la journée, je veux appuyer sur un bouton, pas remplir un formulaire. »

| | |
| --- | --- |
| **Âge** | 31 ans |
| **Poste** | Plombier chauffagiste, technicien d'intervention |
| **Entreprise** | Plomberie Durand |
| **Ancienneté** | 10 ans de métier, 3 ans dans l'entreprise |
| **Aisance numérique** | Bonne sur smartphone (messagerie, GPS, réseaux sociaux), faible sur ordinateur |
| **Équipement** | Smartphone Android fourni par l'entreprise, camionnette |

### Sa journée type

- **7 h 45** : reçoit le planning par SMS, vérifie les adresses dans son GPS.
- **8 h – 18 h** : réalise 4 à 8 interventions (fuites, débouchages, chauffe-eau, entretiens de chaudière).
- **Entre deux chantiers** : appelle Sophie pour signaler une fin d'intervention ou un imprévu.
- **Fin de journée** : note sur papier ce qu'il a fait, pour la facturation.

### Objectifs

- Connaître sa tournée dès le matin, dans le bon ordre.
- Avoir sous la main l'adresse, le code d'accès, le téléphone du client et la nature du problème.
- Signaler en un geste qu'il commence ou qu'il a terminé une intervention.
- Être prévenu tout de suite d'un changement de planning.

### Frustrations

- Les informations incomplètes : pas de code d'accès, pas d'étage, problème mal décrit.
- Les changements de planning annoncés au dernier moment.
- Devoir rappeler le bureau pour chaque information.

### Ce que Plumbly doit lui apporter

- Un écran « Ma tournée du jour » lisible sur téléphone, dans l'ordre de passage.
- Une adresse qui ouvre directement le GPS et un numéro qui lance l'appel.
- Deux boutons : « Démarrer » et « Terminer », avec un compte rendu facultatif.

### Critères d'ergonomie

- Utilise l'application debout, parfois avec des gants ou les mains mouillées : grandes zones tactiles (44 × 44 px minimum), peu de saisie.
- Connexion 4G parfois faible : écrans légers, informations essentielles en haut.
- Lecture en plein soleil : contrastes élevés.

---

## Michel Durand, gérant

> « Je veux savoir combien on fait d'interventions et qui est débordé, sans passer ma journée sur le planning. »

| | |
| --- | --- |
| **Âge** | 55 ans |
| **Poste** | Gérant et fondateur de Plomberie Durand |
| **Aisance numérique** | Faible à moyenne : consulte ses mails et sa banque en ligne |
| **Équipement** | Ordinateur portable, smartphone |

### Objectifs

- Suivre l'activité : nombre d'interventions par période, par technicien et par statut.
- Repérer les retards et les techniciens surchargés.
- Créer les comptes des nouveaux employés et désactiver ceux qui partent.

### Frustrations

- Aucune donnée fiable pour piloter l'entreprise ou justifier une embauche.
- Dépendre de Sophie pour savoir où en est l'activité.

### Ce que Plumbly doit lui apporter

- Un tableau de bord simple avec quelques indicateurs clés.
- La gestion des comptes utilisateurs et des rôles.

### Critères d'ergonomie

- Consulte rarement l'application : les écrans doivent se comprendre sans formation.

---

## Synthèse des besoins par persona

| Besoin | Sophie | Karim | Michel | User stories |
| --- | --- | --- | --- | --- |
| Se connecter de façon sécurisée | ● | ● | ● | US01, US02, US04 |
| Gérer les comptes et les rôles | | | ● | US03 |
| Gérer clients et adresses | ● | | | US06 à US10 |
| Gérer techniciens et indisponibilités | ● | | | US11 à US13 |
| Créer et suivre les interventions | ● | | | US14 à US16 |
| Mettre à jour le statut sur le terrain | | ● | | US17, US18 |
| Planifier les tournées | ● | | | US20 à US23, US25 |
| Consulter sa tournée du jour | | ● | | US24 |
| Suivre l'activité | ○ | | ● | US26 à US29 |

● besoin principal · ○ besoin secondaire
