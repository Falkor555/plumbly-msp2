/**
 * Lecture des couleurs citées par les classes Tailwind du code, pour contrôler les contrastes de
 * la charte (RGAA 3.2) sans dépendre du rendu : jsdom ne calcule pas les styles de Tailwind.
 */

/** Nom de couleur (sans le préfixe `--color-`) vers sa valeur `#rrggbb`. */
export type Palette = Record<string, string>;

export type Propriete = 'text' | 'bg';

/** Couleurs qu'une classe a le droit de citer, propriété par propriété. */
export interface Charte {
  /** Jetons de @theme et couleurs Tailwind tolérées. */
  admises: Record<Propriete, string[]>;
  /** Couleurs admises seulement avec une opacité (un voile), qui n'entrent dans aucun couple. */
  admisesTranslucides: Record<Propriete, string[]>;
}

export interface CoupleDeCouleurs {
  texte: string;
  fond: string;
}

export interface AnalyseDesClasses {
  /** Classes text-/bg- dont la couleur n'est pas admise par la charte. */
  couleursInconnues: string[];
  /** Couples (texte, fond) affichés, au repos et au survol. */
  couples: CoupleDeCouleurs[];
}

type Etat = 'repos' | 'survol';

interface ClasseDeCouleur {
  propriete: Propriete;
  couleur: string;
  translucide: boolean;
  /** null : variante non contrôlée (focus, disabled, points de rupture…). */
  etat: Etat | null;
}

/*
 * Fond supposé d'un texte dont la chaîne de classes ne pose aucun fond : les deux surfaces de la
 * charte (cartes et fenêtres blanches, fond de page). Le texte doit rester lisible sur les deux.
 */
const SURFACES = ['white', 'fond'];

/*
 * Seules les valeurs arbitraires qui sont des tailles ou des images sont neutres. Toute autre
 * (text-[#b91c1c], bg-[red], text-[color:…], bg-[oklab(…)]) est tenue pour une couleur écrite en
 * dur, donc signalée : mieux vaut un faux signalement qu'une couleur qui échappe au contrôle.
 */
const VALEUR_ARBITRAIRE_NEUTRE = String.raw`\[(?:[\d.]+(?:px|r?em|%|vh|vw|ch|lh)?|(?:length|position|size):.+|url\(.+\))\]`;
const TEXTE_SANS_COULEUR = new RegExp(
  `^(xs|sm|base|lg|[2-9]?xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|shadow(-.+)?|${VALEUR_ARBITRAIRE_NEUTRE})$`,
);
const FOND_SANS_COULEUR = new RegExp(
  `^(none|fixed|local|scroll|auto|cover|contain|repeat(-.+)?|no-repeat|center|top|bottom|left|right|(left|right)-(top|bottom)|clip-.+|origin-.+|blend-.+|linear-.+|radial(-.+)?|conic(-.+)?|position-.+|size-.+|transparent|current|inherit|${VALEUR_ARBITRAIRE_NEUTRE})$`,
);

/*
 * Chaîne entre guillemets ou accents graves, sur une ligne, ASCII sans guillemet d'aucune sorte :
 * une apostrophe de texte français (« n'avez », « aujourd'hui ») ne peut ainsi pas ouvrir une
 * fausse chaîne qui avalerait une vraie liste de classes.
 */
const LITTERAL_SIMPLE = /(['"`])([\x20\x21\x23-\x26\x28-\x5f\x61-\x7e]*)\1/g;
// Gabarit complet, sur plusieurs lignes : les accents graves vont par paires dans le code.
const GABARIT = /`([^`]*)`/g;
// Expression ${…} d'un gabarit, avec au plus un niveau d'accolades imbriquées.
const EXPRESSION_DE_GABARIT = /\$\{(?:[^{}]|\{[^{}]*\})*\}/g;
/*
 * Classe text-/bg- n'importe où dans le source, variantes comprises (hover:, data-[…]:), précédée
 * d'un blanc, d'un guillemet ou d'un accent grave. Les « : » d'une valeur arbitraire restent dans
 * l'utilitaire (text-[color:#b91c1c]).
 */
const CLASSE_TEXT_OU_BG =
  /(?<=^|[\s'"`])(?:[\w-]+(?:\[[^\]\s]*\])?:)*!?(?:text|bg)-(?:[\w.%/-]|\[[^\]\s]*\])+!?/g;

/** Couleurs du bloc `@theme`, en refusant toute valeur que le calcul WCAG ne saurait pas lire. */
export function lireJetonsDeCouleur(feuilleDeStyle: string): Palette {
  const bloc = /@theme\s*\{([^}]*)\}/.exec(feuilleDeStyle)?.[1];
  if (bloc === undefined) throw new Error('Bloc @theme introuvable dans la feuille de style.');
  const jetons: Palette = {};
  for (const [, nom, valeur] of bloc.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) {
    const couleur = valeur.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(couleur)) {
      throw new Error(`Jeton --color-${nom} : « ${couleur} » n'est pas au format #RRGGBB.`);
    }
    jetons[nom] = couleur;
  }
  return jetons;
}

function normaliser(chaine: string): string {
  return chaine.replace(/\s+/g, ' ').trim();
}

/*
 * Chaînes qu'un gabarit à expressions peut produire : sa partie fixe seule, puis la partie fixe
 * suivie de chaque littéral de ses expressions (les branches d'un ternaire). Une branche hérite
 * ainsi des couleurs de la partie fixe, comme dans la page.
 */
function chainesDuGabarit(contenu: string): string[] {
  const expressions = contenu.match(EXPRESSION_DE_GABARIT) ?? [];
  if (expressions.length === 0) return [];
  const fixe = normaliser(contenu.replace(EXPRESSION_DE_GABARIT, ' '));
  const branches = expressions.flatMap((expression) =>
    [...expression.matchAll(LITTERAL_SIMPLE)].map(([, , branche]) => branche),
  );
  return [fixe, ...branches.map((branche) => normaliser(`${fixe} ${branche}`))];
}

/** Chaînes littérales d'un fichier source qui peuvent porter des classes. */
export function litterauxDuSource(source: string): string[] {
  const simples = [...source.matchAll(LITTERAL_SIMPLE)].map(([, , contenu]) => contenu);
  const gabarits = [...source.matchAll(GABARIT)].flatMap(([, contenu]) =>
    chainesDuGabarit(contenu),
  );
  return [...simples, ...gabarits];
}

function etatDesVariantes(variantes: string[]): Etat | null {
  if (variantes.length === 0) return 'repos';
  return variantes.length === 1 && variantes[0] === 'hover' ? 'survol' : null;
}

/** La couleur que pose une classe text-/bg-, ou null pour une autre classe. */
function lireClasseDeCouleur(classe: string): ClasseDeCouleur | null {
  // Un « : » placé entre crochets (text-[color:#b91c1c]) ne sépare pas deux variantes.
  const variantes = classe.replace(/^!|!$/g, '').split(/:(?![^[]*\])/);
  const utilitaire = variantes.pop() ?? '';
  const [, propriete, reste] = /^(text|bg)-(.+)$/.exec(utilitaire) ?? [];
  if (propriete !== 'text' && propriete !== 'bg') return null;
  // « /40 » est une opacité pour une couleur (bg-anthracite/40), une hauteur de ligne pour une
  // taille (text-sm/6) : on la retire avant de reconnaître l'utilitaire. Une « / » entre crochets
  // (bg-[url(/a.png)]) n'en est pas une.
  const [, couleur, opacite] = /^(.+?)(?:\/([^/\]]+))?$/.exec(reste) ?? [];
  const sansCouleur = propriete === 'text' ? TEXTE_SANS_COULEUR : FOND_SANS_COULEUR;
  if (sansCouleur.test(couleur)) return null;
  return {
    propriete,
    couleur,
    translucide: opacite !== undefined,
    etat: etatDesVariantes(variantes),
  };
}

function estAdmise({ propriete, couleur, translucide }: ClasseDeCouleur, charte: Charte): boolean {
  if (charte.admises[propriete].includes(couleur)) return true;
  return translucide && charte.admisesTranslucides[propriete].includes(couleur);
}

/** Classes text-/bg- de tout le source, chaînes et gabarits confondus, hors couleurs admises. */
export function couleursInconnuesDuSource(source: string, charte: Charte): string[] {
  return [...source.matchAll(CLASSE_TEXT_OU_BG)]
    .map(([classe]) => ({ classe, couleur: lireClasseDeCouleur(classe) }))
    .filter(({ couleur }) => couleur !== null && !estAdmise(couleur, charte))
    .map(({ classe }) => classe);
}

/*
 * Couples d'un état. Une couleur retenue translucide, propre à l'état ou héritée du repos, écarte
 * l'état : la couleur vue dépend de ce qu'il y a dessous, que la chaîne de classes ne dit pas.
 */
function couplesDeLEtat(repos: ClasseDeCouleur[], etat: ClasseDeCouleur[]): CoupleDeCouleurs[] {
  const retenues = (propriete: Propriete): ClasseDeCouleur[] => {
    const propres = etat.filter((classe) => classe.propriete === propriete);
    return propres.length > 0 ? propres : repos.filter((c) => c.propriete === propriete);
  };
  const textes = retenues('text');
  const fonds = retenues('bg');
  if ([...textes, ...fonds].some((classe) => classe.translucide)) return [];
  const couleursDeFond = fonds.length > 0 ? fonds.map((classe) => classe.couleur) : SURFACES;
  return textes.flatMap(({ couleur }) => couleursDeFond.map((fond) => ({ texte: couleur, fond })));
}

/** Analyse une chaîne de classes : couleurs inconnues et couples (texte, fond) à contrôler. */
export function analyserClasses(chaine: string, charte: Charte): AnalyseDesClasses {
  const classes = chaine
    .split(/\s+/)
    .map((classe) => ({ classe, couleur: lireClasseDeCouleur(classe) }))
    .filter((lue): lue is { classe: string; couleur: ClasseDeCouleur } => lue.couleur !== null);
  const couleursInconnues = classes
    .filter(({ couleur }) => !estAdmise(couleur, charte))
    .map(({ classe }) => classe);
  const parEtat = (etat: Etat) =>
    classes.map(({ couleur }) => couleur).filter((couleur) => couleur.etat === etat);
  const survol = parEtat('survol');
  const couples = [
    ...couplesDeLEtat(parEtat('repos'), parEtat('repos')),
    ...(survol.length > 0 ? couplesDeLEtat(parEtat('repos'), survol) : []),
  ];
  return { couleursInconnues, couples };
}
