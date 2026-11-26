import { describe, expect, it } from 'vitest';

/*
 * Les couleurs d'état passent par les jetons de @theme (index.css), dont les contrastes sont
 * mesurés par contrastesCharte.test.ts : une teinte de la palette colorée de Tailwind échapperait
 * à ce contrôle. Les neutres (gray, slate, zinc, neutral, stone) restent tolérés, comme dans les
 * composants existants (bordures, fonds de survol).
 *
 * Toute propriété est visée (text, bg, border-l, ring-offset, drop-shadow…), quelles que soient
 * ses variantes (hover:, aria-[…]:, [&>svg]:, *:) : seule la classe, sans ses variantes, est
 * relevée, car la teinte suffit à la condamner.
 */
const CLASSE_DE_PALETTE_COLOREE =
  /(?<![\w-])[a-z]+(?:-[a-z]+)*-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?(?![\w-])/g;

/** Couleur arbitraire (« bg-[#…] », « text-[oklch(…)] ») : elle contournerait aussi @theme. */
const CLASSE_DE_COULEUR_ARBITRAIRE =
  /(?<![\w-])[a-z]+(?:-[a-z]+)*-\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|color:)[^\]\s]*\]/g;

/** Seules classes de la palette admises, avec la raison de chacune. */
const EXCEPTIONS = [
  {
    fichier: '/src/signature/BlocSignature.tsx',
    classe: 'text-green-800',
    raison: 'badge « Contenu intact » gardé tel quel par décision d’Arnaud (6,8:1 sur son fond)',
  },
];

// Seul ce fichier est écarté, puisqu'il cite l'exception en clair ; les autres tests sont lus.
const SOURCES = import.meta.glob<string>(
  ['/src/**/*.{ts,tsx}', '!/src/commun/paletteCharte.test.ts'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

function classesHorsCharte(source: string): string[] {
  return [
    ...(source.match(CLASSE_DE_PALETTE_COLOREE) ?? []),
    ...(source.match(CLASSE_DE_COULEUR_ARBITRAIRE) ?? []),
  ];
}

function estUneException(fichier: string, classe: string): boolean {
  return EXCEPTIONS.some(
    (exception) => exception.fichier === fichier && exception.classe === classe,
  );
}

describe('palette de couleurs des sources', () => {
  it('RGAA 3.2 : aucune source n’emploie une couleur de la palette colorée de Tailwind ni une couleur arbitraire', () => {
    const interdites = Object.entries(SOURCES).flatMap(([fichier, source]) =>
      classesHorsCharte(source)
        .filter((classe) => !estUneException(fichier, classe))
        .map((classe) => `${fichier} : ${classe}`),
    );

    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    expect(interdites).toEqual([]);
  });

  it.each(EXCEPTIONS)(
    'RGAA 3.2 : l’exception $classe sert encore dans $fichier',
    ({ fichier, classe }) => {
      expect(classesHorsCharte(SOURCES[fichier] ?? ''), 'exception à retirer').toContain(classe);
    },
  );

  it('RGAA 3.2 : relève les variantes, côtés, opacités et couleurs arbitraires, mais pas les neutres ni les jetons', () => {
    // Exemples assemblés, pour qu'aucune classe hors charte n'apparaisse en clair dans un source
    // et que Tailwind ne l'ajoute pas à la feuille livrée.
    const releve = (...morceaux: string[]): string => morceaux.join('-');
    const attendues = [
      releve('bg', 'red', '50'),
      releve('ring', 'blue', '500/40'),
      releve('border', 'red', '500'),
      releve('text', 'red', '500'),
      releve('bg', 'red', '50'),
      releve('border-l', 'red', '500'),
      releve('ring-offset', 'red', '500'),
      releve('drop-shadow', 'red', '500'),
      releve('text', '[#dc2626]'),
      releve('bg', '[oklch(0.9_0.1_20)]'),
    ];
    const ecrites = [
      attendues[0],
      `focus:hover:${attendues[1]}`,
      `aria-[invalid=true]:${attendues[2]}`,
      `[&>svg]:${attendues[3]}`,
      `*:${attendues[4]}`,
      ...attendues.slice(5),
    ];
    const neutre = releve('border', 'slate', '300');
    const source = `"${ecrites.join(' ')} text-erreur-texte bg-gray-100 ${neutre} bg-sarcelle/15"`;

    expect(classesHorsCharte(source).sort()).toEqual([...attendues].sort());
  });
});
