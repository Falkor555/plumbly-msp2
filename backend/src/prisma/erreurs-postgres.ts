import { Prisma } from '../generated/prisma/client.ts';

/*
 * Lecture des erreurs que Prisma 7 remonte avec l'adaptateur pg.
 *
 * Le code PostgreSQL (SQLSTATE) n'est pas dans erreur.code (code Prisma, P2010 pour une requête
 * écrite à la main) : l'adaptateur le range dans meta.driverAdapterError.cause.originalCode. La
 * même cause porte le message et le détail de PostgreSQL, qui peuvent citer la ligne refusée
 * (« Failing row contains (…) » pour une contrainte CHECK) : ils ne sortent jamais d'ici.
 */

/** Ce qu'on peut journaliser d'une erreur de la base sans y faire entrer de donnée. */
export interface DiagnosticBase {
  codePrisma: string | null;
  codePostgres: string | null;
  contrainte: string | null;
}

interface CauseDeLAdaptateur {
  originalCode?: unknown;
  originalMessage?: unknown;
  constraint?: unknown;
}

// Un nom de contrainte est un identifiant du schéma, jamais une valeur saisie.
const NOM_DE_CONTRAINTE = /constraint "([A-Za-z0-9_]+)"/;
const DELAI_DE_VERROU_DEPASSE = '55P03';

/** Toute erreur levée par le client Prisma ou par l'adaptateur pg. */
export function estUneErreurDeLaBase(erreur: unknown): boolean {
  return (
    erreur instanceof Prisma.PrismaClientKnownRequestError ||
    erreur instanceof Prisma.PrismaClientUnknownRequestError ||
    erreur instanceof Prisma.PrismaClientValidationError ||
    erreur instanceof Prisma.PrismaClientRustPanicError ||
    erreur instanceof Prisma.PrismaClientInitializationError ||
    (erreur instanceof Error && erreur.name === 'DriverAdapterError')
  );
}

/** lock_timeout atteint en attendant un verrou (SQLSTATE 55P03). */
export function estUnDelaiDeVerrouDepasse(erreur: unknown): boolean {
  return diagnostiquer(erreur).codePostgres === DELAI_DE_VERROU_DEPASSE;
}

export function diagnostiquer(erreur: unknown): DiagnosticBase {
  const cause = causeDe(erreur);
  return {
    codePrisma: erreur instanceof Prisma.PrismaClientKnownRequestError ? erreur.code : null,
    codePostgres: typeof cause?.originalCode === 'string' ? cause.originalCode : null,
    contrainte: contrainteDe(cause),
  };
}

function causeDe(erreur: unknown): CauseDeLAdaptateur | undefined {
  if (erreur instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = erreur.meta as { driverAdapterError?: { cause?: CauseDeLAdaptateur } } | undefined;
    return meta?.driverAdapterError?.cause;
  }
  if (erreur instanceof Error && erreur.name === 'DriverAdapterError') {
    return (erreur as Error & { cause?: CauseDeLAdaptateur }).cause;
  }
  return undefined;
}

/**
 * Unicité et clé étrangère : l'adaptateur garde le nom ({ index }). CHECK et autres : il n'est que
 * dans le message, dont seul le nom est extrait.
 */
function contrainteDe(cause: CauseDeLAdaptateur | undefined): string | null {
  const { constraint, originalMessage } = cause ?? {};
  if (typeof constraint === 'object' && constraint !== null && 'index' in constraint) {
    const { index } = constraint;
    if (typeof index === 'string') {
      return index;
    }
  }
  if (typeof originalMessage === 'string') {
    return NOM_DE_CONTRAINTE.exec(originalMessage)?.[1] ?? null;
  }
  return null;
}
