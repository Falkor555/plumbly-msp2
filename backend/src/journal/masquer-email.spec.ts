import { masquerEmail } from './masquer-email.js';

describe('masquerEmail', () => {
  it('garde la première lettre et le domaine', () => {
    expect(masquerEmail('karim.benali@exemple.fr')).toBe('k***@exemple.fr');
  });

  it('ne révèle pas la longueur d’une partie locale d’un seul caractère', () => {
    expect(masquerEmail('k@exemple.fr')).toBe('k***@exemple.fr');
  });

  it('ignore les espaces autour de la saisie et met le domaine en minuscules', () => {
    expect(masquerEmail('  Karim@Exemple.FR ')).toBe('K***@exemple.fr');
  });

  it('ne coupe pas un caractère accentué en deux', () => {
    expect(masquerEmail('élodie@exemple.fr')).toBe('é***@exemple.fr');
  });

  it.each([
    ['vide', ''],
    ['sans arobase', 'karim.exemple.fr'],
    ['sans partie locale', '@exemple.fr'],
    ['sans domaine', 'karim@'],
    ['domaine sans point', 'karim@exemple'],
    ['avec espace', 'karim benali@exemple.fr'],
    ['trop long', `${'a'.repeat(250)}@exemple.fr`],
  ])('renvoie *** pour une saisie invalide (%s), sans rien en recopier', (_cas, saisie) => {
    expect(masquerEmail(saisie)).toBe('***');
  });
});
