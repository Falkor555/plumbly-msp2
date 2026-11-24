import { lireUrlMongoDb } from './connexion-mongodb.js';

describe('lireUrlMongoDb', () => {
  it('renvoie MONGODB_URI quand elle est définie', () => {
    const url = lireUrlMongoDb({ MONGODB_URI: 'mongodb://localhost:27017/plumbly' });

    expect(url).toBe('mongodb://localhost:27017/plumbly');
  });

  it.each([
    ['absente', {}],
    ['vide', { MONGODB_URI: '   ' }],
  ])('explique où la définir quand elle est %s', (_cas, env) => {
    expect(() => lireUrlMongoDb(env)).toThrow(/MONGODB_URI manquante.*backend\/\.env/);
  });
});
