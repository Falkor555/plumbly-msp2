import { Client } from 'pg';

describe('base PostgreSQL éphémère (Testcontainers)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('démarre un PostgreSQL 17 joignable par DATABASE_URL', async () => {
    const resultat = await client.query<{ server_version_num: string }>('SHOW server_version_num');

    expect(Number(resultat.rows[0].server_version_num)).toBeGreaterThanOrEqual(170000);
    expect(Number(resultat.rows[0].server_version_num)).toBeLessThan(180000);
  });

  it('utilise le fuseau horaire de La Réunion, comme la base de développement', async () => {
    const resultat = await client.query<{ TimeZone: string }>('SHOW TimeZone');

    expect(resultat.rows[0].TimeZone).toBe('Indian/Reunion');
  });
});
