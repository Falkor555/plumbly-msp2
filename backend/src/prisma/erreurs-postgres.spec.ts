import { Prisma } from '../generated/prisma/client.ts';
import {
  diagnostiquer,
  estUnDelaiDeVerrouDepasse,
  estUneErreurDeLaBase,
} from './erreurs-postgres.js';

/** Erreur telle que Prisma 7 la lève avec l'adaptateur pg (meta.driverAdapterError.cause). */
function erreurPrisma(code: string, cause: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(
    `Raw query failed. Code: \`${String(cause.originalCode)}\``,
    {
      code,
      clientVersion: '7.10.1',
      meta: { driverAdapterError: { name: 'DriverAdapterError', cause } },
    },
  );
}

const VIOLATION_CHECK = {
  kind: 'postgres',
  originalCode: '23514',
  originalMessage:
    'new row for relation "client" violates check constraint "client_identite_check"',
  detail: 'Failing row contains (12, PARTICULIER, Grondin, Hélène, null, 0692123456, …).',
};

describe('erreurs de la base', () => {
  describe('diagnostiquer', () => {
    it('lit le code Prisma, le SQLSTATE et le nom d’une contrainte CHECK, rien d’autre', () => {
      const diagnostic = diagnostiquer(erreurPrisma('P2039', VIOLATION_CHECK));

      expect(diagnostic).toEqual({
        codePrisma: 'P2039',
        codePostgres: '23514',
        contrainte: 'client_identite_check',
      });
      expect(JSON.stringify(diagnostic)).not.toMatch(/Grondin|Hélène|0692123456|Failing row/);
    });

    it('lit le nom d’une contrainte d’unicité ou de clé étrangère gardé par l’adaptateur', () => {
      const unicite = erreurPrisma('P2002', {
        kind: 'UniqueConstraintViolation',
        originalCode: '23505',
        originalMessage: 'duplicate key value violates unique constraint "utilisateur_email_key"',
        constraint: { index: 'utilisateur_email_key' },
      });

      expect(diagnostiquer(unicite).contrainte).toBe('utilisateur_email_key');
    });

    it('lit une erreur de l’adaptateur non convertie par Prisma', () => {
      const erreur = Object.assign(new Error('postgres'), {
        name: 'DriverAdapterError',
        cause: { originalCode: '22021', originalMessage: 'invalid byte sequence' },
      });

      expect(diagnostiquer(erreur)).toEqual({
        codePrisma: null,
        codePostgres: '22021',
        contrainte: null,
      });
    });

    it('ne trouve rien dans une erreur qui ne vient pas de la base', () => {
      expect(diagnostiquer(new Error('constraint "piege"'))).toEqual({
        codePrisma: null,
        codePostgres: null,
        contrainte: null,
      });
    });

    it('n’extrait pas un nom de contrainte qui ne serait pas un identifiant', () => {
      const erreur = erreurPrisma('P2010', {
        originalCode: 'P0001',
        originalMessage: 'violates check constraint "Grondin Hélène 0692123456"',
      });

      expect(diagnostiquer(erreur).contrainte).toBeNull();
    });
  });

  describe('estUnDelaiDeVerrouDepasse', () => {
    it('reconnaît le SQLSTATE 55P03 dans une erreur P2010 de requête écrite à la main', () => {
      const erreur = erreurPrisma('P2010', {
        kind: 'postgres',
        originalCode: '55P03',
        originalMessage: 'canceling statement due to lock timeout',
      });

      expect(estUnDelaiDeVerrouDepasse(erreur)).toBe(true);
    });

    it('ne prend pas une autre erreur, ni un message qui parlerait de 55P03, pour un délai dépassé', () => {
      expect(estUnDelaiDeVerrouDepasse(erreurPrisma('P2039', VIOLATION_CHECK))).toBe(false);
      expect(estUnDelaiDeVerrouDepasse(new Error('Code: `55P03`'))).toBe(false);
    });
  });

  describe('estUneErreurDeLaBase', () => {
    it.each([
      ['connue', erreurPrisma('P2039', VIOLATION_CHECK)],
      [
        'inconnue',
        new Prisma.PrismaClientUnknownRequestError('panne', { clientVersion: '7.10.1' }),
      ],
      [
        'de validation',
        new Prisma.PrismaClientValidationError('argument', { clientVersion: '7.10.1' }),
      ],
    ])('reconnaît une erreur Prisma %s', (_cas, erreur) => {
      expect(estUneErreurDeLaBase(erreur)).toBe(true);
    });

    it('ne prend pas une erreur ordinaire pour une erreur de la base', () => {
      expect(estUneErreurDeLaBase(new TypeError('x is undefined'))).toBe(false);
    });
  });
});
