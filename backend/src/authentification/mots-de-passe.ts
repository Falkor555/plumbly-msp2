import { argon2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/*
 * Mots de passe : hachage argon2id, vérification et politique (cahier des charges, 6.1 ;
 * ADR 0007). Fonctions pures, sans base de données : elles se testent sans serveur.
 */

// Paramètres minimaux recommandés par l'OWASP, identiques à ceux de prisma/seed.ts :
// les comptes de test se connectent sans conversion.
const ARGON2_MEMOIRE_KIO = 19_456;
const ARGON2_PASSES = 2;
const ARGON2_PARALLELISME = 1;
const TAILLE_SEL = 16;
const TAILLE_EMPREINTE = 32;

const LONGUEUR_MINIMUM = 12;
// Au-delà, le calcul argon2 deviendrait un moyen de surcharger le serveur.
const LONGUEUR_MAXIMUM = 128;
const LONGUEUR_PROVISOIRE = 16;

// Format PHC, lu et écrit aussi par le seed : $argon2id$v=19$m=…,t=…,p=…$sel$empreinte
const FORMAT_PHC =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

interface Parametres {
  memoire: number;
  passes: number;
  parallelisme: number;
}

const PARAMETRES_ACTUELS: Parametres = {
  memoire: ARGON2_MEMOIRE_KIO,
  passes: ARGON2_PASSES,
  parallelisme: ARGON2_PARALLELISME,
};

/**
 * Version asynchrone d'argon2 : la version synchrone bloquerait le serveur entier pendant
 * chaque calcul, et aucune autre requête ne serait traitée pendant ce temps.
 */
function calculerEmpreinte(
  motDePasse: string,
  sel: Buffer,
  { memoire, passes, parallelisme }: Parametres,
  tailleEmpreinte: number,
): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    argon2(
      'argon2id',
      {
        message: motDePasse,
        nonce: sel,
        memory: memoire,
        passes,
        parallelism: parallelisme,
        tagLength: tailleEmpreinte,
      },
      (erreur, empreinte) => (erreur ? rejeter(erreur) : resoudre(empreinte)),
    );
  });
}

/** Empreinte au format PHC, avec un sel aléatoire différent à chaque appel. */
export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = randomBytes(TAILLE_SEL);
  const empreinte = await calculerEmpreinte(motDePasse, sel, PARAMETRES_ACTUELS, TAILLE_EMPREINTE);
  const parametres = `m=${ARGON2_MEMOIRE_KIO},t=${ARGON2_PASSES},p=${ARGON2_PARALLELISME}`;
  return `$argon2id$v=19$${parametres}$${sel.toString('base64url')}$${empreinte.toString('base64url')}`;
}

/**
 * Vrai si le mot de passe correspond à l'empreinte stockée. Les paramètres sont relus dans
 * l'empreinte : des empreintes créées avec d'autres paramètres restent vérifiables.
 * La comparaison se fait en temps constant, pour ne rien révéler par la durée de la réponse.
 */
export async function verifierMotDePasse(
  motDePasse: string,
  empreinteStockee: string,
): Promise<boolean> {
  const morceaux = FORMAT_PHC.exec(empreinteStockee);
  if (morceaux === null || motDePasse.length > LONGUEUR_MAXIMUM) {
    return false;
  }
  const [, memoire, passes, parallelisme, selTexte, empreinteTexte] = morceaux;
  const attendue = Buffer.from(empreinteTexte, 'base64url');
  const calculee = await calculerEmpreinte(
    motDePasse,
    Buffer.from(selTexte, 'base64url'),
    { memoire: Number(memoire), passes: Number(passes), parallelisme: Number(parallelisme) },
    attendue.length,
  );
  return timingSafeEqual(calculee, attendue);
}

let empreinteFactice: Promise<string> | undefined;

/**
 * Même calcul qu'une vraie vérification, sur une empreinte factice. Appelée quand l'e-mail
 * est inconnu : la réponse prend alors autant de temps que pour un compte existant, et la
 * durée ne permet pas de deviner quels e-mails ont un compte.
 */
export async function simulerVerification(motDePasse: string): Promise<void> {
  empreinteFactice ??= hacherMotDePasse(randomBytes(TAILLE_SEL).toString('hex'));
  await verifierMotDePasse(motDePasse.slice(0, LONGUEUR_MAXIMUM), await empreinteFactice);
}

/** Règles non respectées par le mot de passe (cahier des charges, 6.1) ; liste vide s'il est conforme. */
export function erreursDePolitique(motDePasse: string, nomDuChamp: string): string[] {
  const erreurs: string[] = [];
  if (motDePasse.length < LONGUEUR_MINIMUM) {
    erreurs.push(`${nomDuChamp} doit contenir au moins ${LONGUEUR_MINIMUM} caractères`);
  }
  if (motDePasse.length > LONGUEUR_MAXIMUM) {
    erreurs.push(`${nomDuChamp} ne peut pas dépasser ${LONGUEUR_MAXIMUM} caractères`);
  }
  if (!/[A-Z]/.test(motDePasse)) {
    erreurs.push(`${nomDuChamp} doit contenir au moins une majuscule`);
  }
  if (!/[a-z]/.test(motDePasse)) {
    erreurs.push(`${nomDuChamp} doit contenir au moins une minuscule`);
  }
  if (!/\d/.test(motDePasse)) {
    erreurs.push(`${nomDuChamp} doit contenir au moins un chiffre`);
  }
  if (!/[^A-Za-z0-9]/.test(motDePasse)) {
    erreurs.push(`${nomDuChamp} doit contenir au moins un caractère spécial`);
  }
  return erreurs;
}

// Sans caractères ambigus (0 et O, 1, l et I) : le mot de passe provisoire est transmis à la main.
const MAJUSCULES = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULES = 'abcdefghijkmnopqrstuvwxyz';
const CHIFFRES = '23456789';
const SPECIAUX = '!#$%&*+-=?@';
const TOUS = MAJUSCULES + MINUSCULES + CHIFFRES + SPECIAUX;

function caractereAuHasard(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

/**
 * Mot de passe provisoire conforme à la politique (US03) : un caractère de chaque famille,
 * le reste au hasard, puis un mélange. randomInt utilise un générateur cryptographique.
 */
export function genererMotDePasseProvisoire(): string {
  const caracteres = [MAJUSCULES, MINUSCULES, CHIFFRES, SPECIAUX].map(caractereAuHasard);
  while (caracteres.length < LONGUEUR_PROVISOIRE) {
    caracteres.push(caractereAuHasard(TOUS));
  }
  // Mélange de Fisher-Yates : sinon les quatre premiers caractères seraient prévisibles.
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}
