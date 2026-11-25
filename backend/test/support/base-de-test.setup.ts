import { inject } from 'vitest';

// L'application lit DATABASE_URL et MONGODB_URI comme en production : chaque fichier de test
// les fait pointer vers les bases éphémères démarrées par le globalSetup.
process.env.DATABASE_URL = inject('urlBaseDeTest');
process.env.MONGODB_URI = inject('urlMongoDbDeTest');

// Secret de signature des jetons, propre aux tests : jamais celui du fichier .env.
process.env.JWT_SECRET = 'secret-des-tests-d-integration-de-32-caracteres-au-moins';
