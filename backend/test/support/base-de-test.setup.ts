import { inject } from 'vitest';

// L'application lit DATABASE_URL comme en production : chaque fichier de test
// la fait pointer vers la base éphémère démarrée par le globalSetup.
process.env.DATABASE_URL = inject('urlBaseDeTest');
