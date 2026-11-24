import { inject } from 'vitest';

// L'application lit DATABASE_URL et MONGODB_URI comme en production : chaque fichier de test
// les fait pointer vers les bases éphémères démarrées par le globalSetup.
process.env.DATABASE_URL = inject('urlBaseDeTest');
process.env.MONGODB_URI = inject('urlMongoDbDeTest');
