import { describe, expect, it } from 'vitest';
import feuilleDeStyle from '../index.css?raw';
import { CONTRASTE_MINIMAL_TEXTE, rapportDeContraste } from './contraste';

/** Jetons « --color-* » du bloc @theme, par nom (« erreur-texte » → « #b91c1c »). */
function lireJetons(css: string): Record<string, string> {
  const theme = /@theme\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  return Object.fromEntries(
    [...theme.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, nom, valeur]) => [
      nom,
      valeur,
    ]),
  );
}

const JETONS = lireJetons(feuilleDeStyle);

/*
 * Couleurs Tailwind tolérées hors @theme. Tailwind les écrit en oklch, que le calcul WCAG ne lit
 * pas : elles sont recopiées ici, converties en sRGB (arrondi à l'octet).
 * Valeurs de Tailwind 4.3.5 : à revérifier à chaque montée de version de Tailwind, qui peut
 * retoucher sa palette sans que ce test le remarque.
 */
const HORS_THEME: Record<string, string> = {
  white: '#ffffff',
  'gray-50': '#f9fafb', // oklch(98.5% 0.002 247.839)
  'gray-100': '#f3f4f6', // oklch(96.7% 0.003 264.542)
  'green-800': '#016630', // oklch(44.8% 0.119 151.328), gardé par décision (BlocSignature)
};

function valeurDe(nom: string): string {
  const valeur = JETONS[nom] ?? HORS_THEME[nom];
  if (valeur === undefined) {
    throw new Error(`Jeton « ${nom} » absent de @theme (index.css) et de HORS_THEME.`);
  }
  return valeur;
}

/*
 * Couples (texte, fond) posés ensemble par les badges, alertes et boutons. Un nouveau couple
 * s'ajoute ici : le test interdit déjà la palette colorée de Tailwind (paletteCharte.test.ts).
 */
const COUPLES: [texte: string, fond: string, ou: string][] = [
  ['anthracite', 'fond', 'texte courant de la page'],
  ['anthracite', 'white', 'cartes, boutons secondaires, pagination, barre du planning'],
  ['gris-texte', 'white', 'badges À planifier et Particulier, messages de liste vide'],
  ['gris-texte', 'gray-100', 'badges Annulée et Archivé, note du client archivé'],
  ['gris-texte', 'gray-50', 'blocs Terminée et Annulée du planning et de Ma tournée'],
  ['gris-texte', 'fond', 'en-têtes des tableaux et du planning'],
  ['sarcelle-profonde', 'sarcelle-claire', 'badges Planifiée et Professionnel, bandeau de clôture'],
  ['sarcelle-profonde', 'white', 'boutons secondaires de Ma tournée (Appeler le client…)'],
  ['info', 'info-fond', 'badge En cours'],
  ['succes-texte', 'succes-fond', 'badge Terminée, message de succès (ZoneAnnonce)'],
  ['green-800', 'succes-fond', 'badge Contenu intact (BlocSignature)'],
  ['chantier', 'chantier-clair', 'badge d’urgence'],
  ['erreur-texte', 'erreur-fond', 'alertes, badges En retard et Contenu modifié'],
  ['succes-texte', 'white', 'règles respectées du mot de passe, coche de la signature (#64)'],
  ['erreur-texte', 'white', 'bouton destructif bordé, erreurs de la connexion et du mot de passe'],
  ['white', 'erreur-texte', 'bouton plein de FenetreConfirmation, survol du bouton d’annulation'],
  ['white', 'erreur', 'bouton plein « Annuler l’intervention » (FenetreAnnulation, #18)'],
  ['white', 'sarcelle', 'boutons principaux, vue et jour choisis, pastille d’étape'],
  ['white', 'sarcelle-profonde', 'survol des boutons principaux'],
  ['anthracite', 'sarcelle-claire', 'survol des jours de la semaine'],
  ['white', 'sarcelle-profonde', 'survol du jour courant de la semaine (seul fond au survol)'],
  ['anthracite', 'gray-100', 'survol des boutons secondaires'],
  ['anthracite', 'gray-50', 'survol des cartes d’intervention et d’adresse'],
  ['sarcelle-profonde', 'gray-50', 'lien Itinéraire au survol de la carte d’adresse'],
  ['sarcelle-profonde', 'gray-100', 'survol du bouton secondaire de Ma tournée'],
];

describe('contrastes des couples de couleurs de la charte', () => {
  it.each(COUPLES)('RGAA 3.2 : %s sur %s atteint 4,5:1 (%s)', (texte, fond) => {
    const rapport = rapportDeContraste(valeurDe(texte), valeurDe(fond));

    expect(rapport).toBeGreaterThanOrEqual(CONTRASTE_MINIMAL_TEXTE);
  });

  it('RGAA 3.2 : mesure sous 4,5:1 l’ancien rouge d’erreur posé sur le fond d’erreur', () => {
    const rapport = rapportDeContraste(valeurDe('erreur'), valeurDe('erreur-fond'));

    expect(valeurDe('erreur')).toBe('#dc2626');
    expect(rapport).toBeCloseTo(4.41, 2);
    expect(rapport).toBeLessThan(CONTRASTE_MINIMAL_TEXTE);
  });

  it('RGAA 3.2 : mesure sous 4,5:1 l’ancien vert de succès posé sur blanc (#64)', () => {
    const rapport = rapportDeContraste(valeurDe('succes'), valeurDe('white'));

    expect(valeurDe('succes')).toBe('#16a34a');
    expect(rapport).toBeCloseTo(3.3, 1);
    expect(rapport).toBeLessThan(CONTRASTE_MINIMAL_TEXTE);
  });

  it('RGAA 3.2 : échoue sur un jeton absent de @theme', () => {
    expect(() => valeurDe('erreur-claire')).toThrow('Jeton « erreur-claire » absent de @theme');
  });
});
