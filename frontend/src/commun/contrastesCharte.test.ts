import { describe, expect, it } from 'vitest';
import feuilleDeStyle from '../index.css?raw';
import { CLASSES_STATUT } from '../planning/presentation';
import {
  analyserClasses,
  couleursInconnuesDuSource,
  lireJetonsDeCouleur,
  litterauxDuSource,
  type Charte,
  type Palette,
} from '../test/couleursDesClasses';
import { CONTRASTE_MINIMAL_TEXTE, rapportDeContraste } from './contraste';

/*
 * Seule la feuille de la charte est lue. Les couleurs de Tailwind sont écrites en oklch, que le
 * calcul WCAG ne lit pas : les rares couleurs Tailwind tolérées hors charte sont recopiées ici,
 * converties en sRGB (arrondi à l'octet).
 */
const COULEURS_TAILWIND: Palette = {
  white: '#ffffff',
  'gray-50': '#f9fafb', // oklch(98.5% 0.002 247.839)
  'gray-100': '#f3f4f6', // oklch(96.7% 0.003 264.542)
  // Gardé tel quel par décision (badge « Contenu intact ») : oklch(44.8% 0.119 151.328).
  'green-800': '#016630',
};

const JETONS = lireJetonsDeCouleur(feuilleDeStyle);
const VALEURS: Palette = { ...COULEURS_TAILWIND, ...JETONS };

/*
 * Tolérances du cadrage, propriété par propriété : le texte blanc des boutons pleins et les
 * neutres de fond déjà utilisés. Toute autre couleur hors @theme fait échouer le test.
 */
const CHARTE: Charte = {
  admises: {
    text: [...Object.keys(JETONS), 'white'],
    bg: [...Object.keys(JETONS), 'white', 'gray-50', 'gray-100'],
  },
  // Voile de survol des blocs du planning (hover:bg-black/3) : admis seulement translucide.
  admisesTranslucides: { text: [], bg: ['black'] },
};

/** Exceptions propres à un fichier, ajoutées à la charte commune. */
const EXCEPTIONS: Record<string, Partial<Charte['admises']>> = {
  '/src/signature/BlocSignature.tsx': { text: ['green-800'] },
};

function charteDe(fichier: string): Charte {
  const exception = EXCEPTIONS[fichier] ?? {};
  return {
    ...CHARTE,
    admises: {
      text: [...CHARTE.admises.text, ...(exception.text ?? [])],
      bg: [...CHARTE.admises.bg, ...(exception.bg ?? [])],
    },
  };
}

/*
 * Chaînes qui colorent une icône et non un texte : RGAA 3.3 (WCAG 1.4.11) leur demande 3:1 au
 * lieu de 4,5:1. Le ✓ vert devant « Signée par … » est décoratif (aria-hidden), le texte voisin
 * est en anthracite. L'exemption ne vaut que dans ce contexte et pour une seule occurrence : un
 * texte ajouté plus tard avec la même chaîne ferait échouer le test RGAA 3.3.
 */
const CONTRASTE_MINIMAL_GRAPHIQUE = 3;
const ICONES: { fichier: string; chaine: string; contexte: string }[] = [
  {
    fichier: '/src/ma-tournee/PageMaTournee.tsx',
    chaine: 'text-succes',
    contexte: '<span aria-hidden="true" className="text-succes">',
  },
];

function seuilDe(fichier: string, chaine: string): number {
  const estUneIcone = ICONES.some((icone) => icone.fichier === fichier && icone.chaine === chaine);
  return estUneIcone ? CONTRASTE_MINIMAL_GRAPHIQUE : CONTRASTE_MINIMAL_TEXTE;
}

const SOURCES = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/test/**'],
  { query: '?raw', import: 'default', eager: true },
);

function rapport(texte: string, fond: string): number {
  return rapportDeContraste(VALEURS[texte], VALEURS[fond]);
}

/** Chaque chaîne de classes des sources, avec le fichier d'où elle vient. */
function chainesDeClasses(): { fichier: string; chaine: string }[] {
  return Object.entries(SOURCES).flatMap(([fichier, source]) =>
    litterauxDuSource(source).map((chaine) => ({ fichier, chaine })),
  );
}

describe('jetons de couleur de la charte', () => {
  it('RGAA 3.2 : définit les teintes de texte et de fond des messages d’état', () => {
    expect(JETONS).toMatchObject({
      'erreur-texte': '#b91c1c',
      'succes-texte': '#15803d',
      'alerte-texte': '#b45309',
      'erreur-fond': '#fef2f2',
      'succes-fond': '#f0fdf4',
      'info-fond': '#eff6ff',
      'alerte-fond': '#fffbeb',
    });
  });
});

describe('contrastes des badges et des alertes', () => {
  it.each(Object.entries(CLASSES_STATUT))(
    'RGAA 3.2 : le badge de statut %s atteint 4,5:1',
    (_statut, classes) => {
      const { couleursInconnues, couples } = analyserClasses(classes, CHARTE);

      expect(couleursInconnues).toEqual([]);
      expect(couples).toHaveLength(1);
      expect(rapport(couples[0].texte, couples[0].fond)).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMAL_TEXTE,
      );
    },
  );

  it.each([
    ['badge d’urgence', 'chantier', 'chantier-clair'],
    ['badge « En retard » et « Contenu modifié »', 'erreur-texte', 'erreur-fond'],
    ['badge « Contenu intact »', 'green-800', 'succes-fond'],
    ['alerte d’erreur', 'erreur-texte', 'erreur-fond'],
    ['alerte d’erreur sans fond, dans une fenêtre', 'erreur-texte', 'white'],
    ['alerte d’erreur sans fond, sur la page', 'erreur-texte', 'fond'],
    ['message de succès', 'succes-texte', 'succes-fond'],
    ['message d’avertissement', 'alerte-texte', 'alerte-fond'],
    ['message d’information', 'info', 'info-fond'],
  ])('RGAA 3.2 : %s (%s sur %s) atteint 4,5:1', (_usage, texte, fond) => {
    expect(rapport(texte, fond)).toBeGreaterThanOrEqual(CONTRASTE_MINIMAL_TEXTE);
  });
});

describe('contrastes de toutes les classes des sources', () => {
  it('RGAA 3.2 : chaque classe text-/bg- cite une couleur de @theme ou une tolérance', () => {
    const horsCharte = Object.entries(SOURCES).flatMap(([fichier, source]) =>
      couleursInconnuesDuSource(source, charteDe(fichier)).map(
        (classe) => `${fichier} : ${classe}`,
      ),
    );

    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    expect(horsCharte).toEqual([]);
  });

  it('RGAA 3.2 : chaque couple (texte, fond) des sources atteint 4,5:1 (3:1 pour une icône)', () => {
    const controles = chainesDeClasses().flatMap(({ fichier, chaine }) =>
      analyserClasses(chaine, charteDe(fichier)).couples.map((couple) => ({
        fichier,
        seuil: seuilDe(fichier, chaine),
        ...couple,
      })),
    );
    const insuffisants = controles
      // Une couleur inconnue est déjà signalée par le test précédent.
      .filter(({ texte, fond }) => Object.hasOwn(VALEURS, texte) && Object.hasOwn(VALEURS, fond))
      .filter(({ texte, fond, seuil }) => rapport(texte, fond) < seuil)
      .map(({ fichier, texte, fond }) => `${fichier} : ${texte} sur ${fond}`);

    expect(insuffisants).toEqual([]);
    // Garde-fou : la lecture des sources trouve bien les badges, sinon le test ne prouverait rien.
    expect(controles.map(({ fichier, texte, fond }) => ({ fichier, texte, fond }))).toEqual(
      expect.arrayContaining([
        {
          fichier: '/src/planning/BadgesIntervention.tsx',
          texte: 'erreur-texte',
          fond: 'erreur-fond',
        },
        { fichier: '/src/signature/BlocSignature.tsx', texte: 'green-800', fond: 'succes-fond' },
        { fichier: '/src/planning/presentation.ts', texte: 'succes-texte', fond: 'succes-fond' },
        // Branche d'un gabarit multiligne, qui hérite du survol de sa partie fixe.
        {
          fichier: '/src/planning/PlanningSemaine.tsx',
          texte: 'anthracite',
          fond: 'sarcelle-claire',
        },
      ]),
    );
  });

  it('RGAA 3.2 : les accents graves vont par paires dans chaque source, sans quoi les gabarits seraient mal lus', () => {
    const impairs = Object.entries(SOURCES)
      .filter(([, source]) => source.split('`').length % 2 === 0)
      .map(([fichier]) => fichier);

    expect(impairs).toEqual([]);
  });

  it('RGAA 3.3 : chaque icône exemptée existe une seule fois, dans son contexte, et atteint 3:1', () => {
    for (const { fichier, chaine, contexte } of ICONES) {
      const source = SOURCES[fichier] ?? '';
      const { couples } = analyserClasses(chaine, CHARTE);

      expect(litterauxDuSource(source).filter((litteral) => litteral === chaine)).toHaveLength(1);
      expect(source).toContain(contexte);
      expect(couples.length).toBeGreaterThan(0);
      for (const { texte, fond } of couples) {
        expect(rapport(texte, fond)).toBeGreaterThanOrEqual(CONTRASTE_MINIMAL_GRAPHIQUE);
      }
    }
  });
});

describe('lecture des couleurs des classes', () => {
  it('RGAA 3.2 : signale une couleur Tailwind hors charte, comme l’ancien bg-red-50', () => {
    const analyse = analyserClasses(
      'rounded border border-erreur/30 bg-red-50 text-erreur',
      CHARTE,
    );

    expect(analyse.couleursInconnues).toEqual(['bg-red-50']);
  });

  it('RGAA 3.2 : mesure sous 4,5:1 l’ancien rouge d’erreur posé sur le fond d’erreur', () => {
    const { couples } = analyserClasses('bg-erreur-fond text-erreur', CHARTE);

    expect(couples).toEqual([{ texte: 'erreur', fond: 'erreur-fond' }]);
    expect(rapport('erreur', 'erreur-fond')).toBeLessThan(CONTRASTE_MINIMAL_TEXTE);
  });

  it('RGAA 3.2 : associe le texte blanc au fond posé dans la même chaîne', () => {
    const { couples } = analyserClasses('h-9 rounded bg-sarcelle px-4 text-sm text-white', CHARTE);

    expect(couples).toEqual([{ texte: 'white', fond: 'sarcelle' }]);
  });

  it('RGAA 3.2 : contrôle un texte sans fond sur les deux surfaces de la charte', () => {
    const { couples } = analyserClasses('text-sm text-erreur-texte', CHARTE);

    expect(couples).toEqual([
      { texte: 'erreur-texte', fond: 'white' },
      { texte: 'erreur-texte', fond: 'fond' },
    ]);
  });

  it('RGAA 3.2 : contrôle aussi le survol, en gardant ce qui ne change pas', () => {
    const { couples } = analyserClasses(
      'bg-sarcelle text-white hover:bg-sarcelle-profonde',
      CHARTE,
    );

    expect(couples).toEqual([
      { texte: 'white', fond: 'sarcelle' },
      { texte: 'white', fond: 'sarcelle-profonde' },
    ]);
  });

  it('RGAA 3.2 : ignore tailles, alignements, hauteurs de ligne et valeurs arbitraires de taille', () => {
    const analyse = analyserClasses(
      'text-sm text-[11px] text-[1.75rem] text-center text-sm/6 text-2xl bg-[url(/a.png)]',
      CHARTE,
    );

    expect(analyse).toEqual({ couleursInconnues: [], couples: [] });
  });

  it('RGAA 3.2 : écarte des couples un état translucide, dont le fond réel est inconnu', () => {
    const analyse = analyserClasses('bg-white text-anthracite hover:bg-black/3', CHARTE);

    expect(analyse.couples).toEqual([{ texte: 'anthracite', fond: 'white' }]);
    expect(analyserClasses('bg-anthracite/40', CHARTE).couples).toEqual([]);
  });

  it('RGAA 3.2 : écarte aussi le survol qui hérite d’un fond translucide du repos', () => {
    const analyse = analyserClasses('bg-anthracite/40 hover:text-white', CHARTE);

    expect(analyse.couples).toEqual([]);
  });

  it('RGAA 3.2 : n’admet le voile noir que translucide, et seulement en fond', () => {
    const analyse = analyserClasses('hover:bg-black/3 bg-black text-black/50', CHARTE);

    expect(analyse.couleursInconnues).toEqual(['bg-black', 'text-black/50']);
  });

  it('RGAA 3.2 : n’admet une tolérance que pour sa propriété', () => {
    const analyse = analyserClasses('text-gray-100 bg-gray-100 text-green-800', CHARTE);

    expect(analyse.couleursInconnues).toEqual(['text-gray-100', 'text-green-800']);
  });

  it('RGAA 3.2 : écarte des couples les variantes disabled: et focus:, mais vérifie leurs couleurs', () => {
    const analyse = analyserClasses('text-gris-texte disabled:bg-gray-50 focus:bg-red-50', CHARTE);

    expect(analyse.couleursInconnues).toEqual(['focus:bg-red-50']);
    expect(analyse.couples).toEqual([
      { texte: 'gris-texte', fond: 'white' },
      { texte: 'gris-texte', fond: 'fond' },
    ]);
  });

  it('RGAA 3.2 : signale une couleur arbitraire écrite en dur, sous toutes ses formes', () => {
    const analyse = analyserClasses(
      'bg-[#fef2f2] text-[#b91c1c] text-[color:#b91c1c] hover:text-[color:red] bg-[red] bg-[oklab(0.5_0.1_0.1)]',
      CHARTE,
    );

    expect(analyse.couleursInconnues).toEqual([
      'bg-[#fef2f2]',
      'text-[#b91c1c]',
      'text-[color:#b91c1c]',
      'hover:text-[color:red]',
      'bg-[red]',
      'bg-[oklab(0.5_0.1_0.1)]',
    ]);
  });

  it('RGAA 3.2 : ne prend pas l’apostrophe d’un texte français pour une chaîne', () => {
    const source = `<p className="text-sm text-erreur-texte">Vous n'avez pas de tournée aujourd'hui.</p>`;

    expect(litterauxDuSource(source)).toEqual(['text-sm text-erreur-texte']);
    expect(litterauxDuSource(`n'a <b className="bg-red-50 text-erreur">x</b> d'`)).toContain(
      'bg-red-50 text-erreur',
    );
  });

  it('RGAA 3.2 : lit la partie fixe d’un gabarit et chacune de ses branches avec elle', () => {
    const source = "className={`${BADGE} text-x ${actif ? 'bg-a' : 'bg-b'}`}";

    expect(litterauxDuSource(source)).toEqual(
      expect.arrayContaining(['text-x', 'text-x bg-a', 'text-x bg-b']),
    );
  });

  it('RGAA 3.2 : lit un gabarit multiligne, comme Prettier les écrit pour un ternaire', () => {
    const source = [
      'className={`rounded text-xs hover:bg-red-50 ${',
      '  actif',
      "    ? 'bg-sarcelle text-white'",
      "    : 'text-anthracite'",
      '}`}',
    ].join('\n');

    const chaines = litterauxDuSource(source);

    expect(chaines).toEqual(
      expect.arrayContaining([
        'rounded text-xs hover:bg-red-50',
        'rounded text-xs hover:bg-red-50 bg-sarcelle text-white',
        'rounded text-xs hover:bg-red-50 text-anthracite',
      ]),
    );
    expect(couleursInconnuesDuSource(source, CHARTE)).toEqual(['hover:bg-red-50']);
  });

  it('RGAA 3.2 : relève toute classe de couleur du source, même hors d’une chaîne lisible', () => {
    const source = "const c = `px-2 text-red-700 ${x ? 'a' : \"b\"}` + ' data-[on]:bg-[red]';";

    expect(couleursInconnuesDuSource(source, CHARTE)).toEqual([
      'text-red-700',
      'data-[on]:bg-[red]',
    ]);
  });

  it('RGAA 3.2 : refuse un jeton de couleur que le calcul ne sait pas lire', () => {
    expect(() => lireJetonsDeCouleur('@theme { --color-x: oklch(50% 0.1 20); }')).toThrow(
      '--color-x',
    );
    expect(() => lireJetonsDeCouleur(':root { --color-x: #ffffff; }')).toThrow('@theme');
  });
});
