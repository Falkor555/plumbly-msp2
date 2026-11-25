import { BadRequestException } from '@nestjs/common';
import {
  type Champs,
  estUneDate,
  lireBooleenDeRequete,
  lireCodePostal,
  lireCouleur,
  lireEmail,
  lireIdentifiant,
  lireObjet,
  lirePagination,
  lireRecherche,
  lireTelephone,
  lireTexte,
  lireTri,
  normaliserTelephone,
  type OptionsTexte,
  paginer,
} from './validation.js';

describe('lireIdentifiant', () => {
  it('lit un identifiant écrit en chiffres', () => {
    expect(lireIdentifiant('42')).toBe(42);
  });

  it.each([
    ['vide', ''],
    ['zéro', '0'],
    ['négatif', '-1'],
    ['décimal', '1.5'],
    ['en notation scientifique', '1e3'],
    ['hexadécimal', '0x1F'],
    ['entouré d’espaces', ' 12 '],
    ['au-delà d’un integer PostgreSQL', '2147483648'],
    ['suivi de SQL', '1 OR 1=1'],
  ])('refuse un identifiant %s', (_cas, texte) => {
    expect(() => lireIdentifiant(texte)).toThrow(BadRequestException);
  });
});

describe('estUneDate', () => {
  it('accepte un jour du calendrier et refuse le 30 février', () => {
    expect(estUneDate('2028-02-29')).toBe(true);
    expect(estUneDate('2026-02-30')).toBe(false);
  });
});

/** Valeur lue et erreurs collectées par un lecteur. */
function lecture(lecteur: (champs: Champs, erreurs: string[]) => unknown, champs: Champs) {
  const erreurs: string[] = [];
  const valeur = lecteur(champs, erreurs);
  return { valeur, erreurs };
}

/** Messages d'une erreur 400, tels que l'API les renvoie. */
function messagesDe(action: () => unknown): unknown {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof BadRequestException) {
      return (erreur.getResponse() as { message: unknown }).message;
    }
    throw erreur;
  }
  throw new Error('Aucune erreur 400 levée');
}

describe('lireObjet', () => {
  it('refuse un champ inconnu en le nommant', () => {
    expect(messagesDe(() => lireObjet({ nom: 'a', role: 'ADMIN' }, ['nom']))).toEqual([
      'Le champ role n’est pas autorisé',
    ]);
  });

  it.each([null, [], 'texte', 3])('refuse un corps qui n’est pas un objet : %j', (corps) => {
    expect(messagesDe(() => lireObjet(corps, []))).toEqual([
      'Le corps de la requête doit être un objet JSON',
    ]);
  });
});

describe('lireTexte', () => {
  const lecteur = (options: OptionsTexte) => (champs: Champs, erreurs: string[]) =>
    lireTexte(champs, 'nomClient', erreurs, options);
  const obligatoire = lecteur({ obligatoire: true, maximum: 100 });

  it('retire les espaces de début et de fin', () => {
    expect(lecture(obligatoire, { nomClient: '  Hoarau  ' })).toEqual({
      valeur: 'Hoarau',
      erreurs: [],
    });
  });

  it('accepte un seul caractère et exactement la longueur maximale', () => {
    expect(lecture(obligatoire, { nomClient: 'H' }).valeur).toBe('H');
    expect(lecture(obligatoire, { nomClient: 'a'.repeat(100) }).valeur).toBe('a'.repeat(100));
  });

  it('refuse un caractère de trop', () => {
    expect(lecture(obligatoire, { nomClient: 'a'.repeat(101) }).erreurs).toEqual([
      'nomClient ne doit pas dépasser 100 caractères',
    ]);
  });

  it.each([
    ['absent', {}, 'nomClient est obligatoire'],
    ['vide', { nomClient: '' }, 'nomClient ne peut pas être vide'],
    ['fait d’espaces', { nomClient: '   ' }, 'nomClient ne peut pas être vide'],
    ['null', { nomClient: null }, 'nomClient est obligatoire'],
    ['d’un autre type', { nomClient: 12 }, 'nomClient doit être un texte'],
  ])('refuse un texte obligatoire %s', (_cas, champs, message) => {
    expect(lecture(obligatoire, champs).erreurs).toEqual([message]);
  });

  it('refuse un caractère NUL, que PostgreSQL rejetterait en erreur 500', () => {
    expect(lecture(obligatoire, { nomClient: 'Hoarau\u0000' }).erreurs).toEqual([
      'nomClient contient un caractère non autorisé',
    ]);
  });

  it.each([
    ['au début d’un emoji', 'Fuite réparée \ud83d'],
    ['à la fin d’un emoji', '\ude00 Fuite réparée'],
  ])(
    'refuse une moitié d’emoji isolée (%s), que la base enregistrerait autrement',
    (_cas, texte) => {
      expect(lecture(obligatoire, { nomClient: texte }).erreurs).toEqual([
        'nomClient contient un caractère non autorisé',
      ]);
    },
  );

  it('accepte un emoji entier', () => {
    expect(lecture(obligatoire, { nomClient: 'Hoarau 😀' }).valeur).toBe('Hoarau 😀');
  });

  it('accepte null pour effacer un champ effaçable', () => {
    const effacable = lecteur({ obligatoire: false, maximum: 100, effacable: true });

    expect(lecture(effacable, { nomClient: null })).toEqual({ valeur: null, erreurs: [] });
  });

  it('refuse null sur un champ facultatif non effaçable, et accepte son absence', () => {
    const facultatif = lecteur({ obligatoire: false, maximum: 100 });

    expect(lecture(facultatif, { nomClient: null }).erreurs).toEqual([
      'nomClient ne peut pas être null',
    ]);
    expect(lecture(facultatif, {})).toEqual({ valeur: undefined, erreurs: [] });
  });
});

describe('téléphone', () => {
  it.each([
    ['0692123456', '0692123456'],
    ['06 92 12 34 56', '0692123456'],
    ['06.92.12.34.56', '0692123456'],
    [' 0692 12.34 56 ', '0692123456'],
  ])('normalise %j en %j', (saisie, attendu) => {
    expect(normaliserTelephone(saisie)).toBe(attendu);
  });

  it.each([
    ['vide', ''],
    ['avec des tirets', '06-92-12-34-56'],
    ['sans 0 initial', '6921234567'],
    ['de 9 chiffres', '069212345'],
    ['de 11 chiffres', '06921234567'],
    ['international', '+262692123456'],
    ['de plus de 20 caractères', '0 6 9 2 1 2 3 4 5 6 . .'],
    ['avec des lettres', '06921234AB'],
  ])('refuse un numéro %s', (_cas, saisie) => {
    expect(normaliserTelephone(saisie)).toBeNull();
  });

  it('explique la règle quand le numéro est refusé', () => {
    const { erreurs } = lecture(
      (champs, liste) => lireTelephone(champs, 'telephone', liste, { obligatoire: true }),
      { telephone: 692123456 },
    );

    expect(erreurs).toEqual([
      'telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)',
    ]);
  });
});

describe('e-mail, code postal et couleur', () => {
  const email = (champs: Champs, erreurs: string[]) =>
    lireEmail(champs, 'emailClient', erreurs, { obligatoire: false, effacable: true });

  it('accepte un e-mail et refuse un format invalide', () => {
    expect(lecture(email, { emailClient: 'jean@exemple.re' }).valeur).toBe('jean@exemple.re');
    expect(lecture(email, { emailClient: 'jean@exemple' }).erreurs).toEqual([
      'emailClient doit être une adresse e-mail valide',
    ]);
  });

  it('refuse un e-mail de plus de 255 caractères', () => {
    const long = `${'a'.repeat(250)}@ex.re`;

    expect(lecture(email, { emailClient: long }).erreurs).toEqual([
      'emailClient ne doit pas dépasser 255 caractères',
    ]);
  });

  it.each(['97400', ' 97400 '])('accepte le code postal %j', (codePostal) => {
    const resultat = lecture(
      (champs, erreurs) => lireCodePostal(champs, 'codePostal', erreurs, { obligatoire: true }),
      { codePostal },
    );

    expect(resultat).toEqual({ valeur: '97400', erreurs: [] });
  });

  it.each(['9740', '974000', '97 40', 'ABCDE', ''])('refuse le code postal %j', (codePostal) => {
    const { erreurs } = lecture(
      (champs, liste) => lireCodePostal(champs, 'codePostal', liste, { obligatoire: true }),
      { codePostal },
    );

    expect(erreurs).toEqual(['codePostal doit contenir 5 chiffres']);
  });

  it('met une couleur en majuscules et refuse les autres formats', () => {
    const couleur = (champs: Champs, erreurs: string[]) =>
      lireCouleur(champs, 'couleurPlanning', erreurs, { obligatoire: true });

    expect(lecture(couleur, { couleurPlanning: '#0f766e' }).valeur).toBe('#0F766E');
    for (const invalide of ['0F766E', '#0F766', '#0F766EE', 'rouge', '#GGGGGG']) {
      expect(lecture(couleur, { couleurPlanning: invalide }).erreurs).toEqual([
        'couleurPlanning doit être une couleur au format #RRGGBB',
      ]);
    }
  });
});

describe('paramètres de liste', () => {
  const pagination = (requete: Champs) =>
    lecture((champs, erreurs) => lirePagination(champs, erreurs), requete);

  it('applique la pagination par défaut', () => {
    expect(pagination({})).toEqual({ valeur: { page: 1, limit: 20 }, erreurs: [] });
  });

  it('accepte 100 éléments par page et refuse 101, 0 ou un texte', () => {
    expect(pagination({ page: '3', limit: '100' }).valeur).toEqual({ page: 3, limit: 100 });
    expect(pagination({ limit: '101' }).erreurs).toEqual([
      'limit doit être un entier entre 1 et 100',
    ]);
    expect(pagination({ page: '0' }).erreurs).toEqual(['page doit être un entier positif']);
    expect(pagination({ page: 'deux' }).erreurs).toEqual(['page doit être un entier positif']);
  });

  it('calcule le nombre de pages', () => {
    expect(paginer(['a'], 41, { page: 3, limit: 20 }).meta).toEqual({
      page: 3,
      limit: 20,
      total: 41,
      totalPages: 3,
    });
    expect(paginer([], 0, { page: 1, limit: 20 }).meta.totalPages).toBe(0);
  });

  it('exige au moins 2 caractères de recherche, espaces exclus', () => {
    const recherche = (valeur: unknown) =>
      lecture((requete, erreurs) => lireRecherche(requete, erreurs), { recherche: valeur });

    expect(recherche('du').valeur).toBe('du');
    expect(recherche(' d ').erreurs).toEqual(['recherche doit contenir au moins 2 caractères']);
    expect(recherche('').erreurs).toEqual(['recherche doit contenir au moins 2 caractères']);
    expect(recherche('a'.repeat(101)).erreurs).toEqual([
      'recherche ne doit pas dépasser 100 caractères',
    ]);
    expect(recherche('ab\u0000').erreurs).toEqual(['recherche contient un caractère non autorisé']);
  });

  it('lit un booléen true ou false et refuse le reste', () => {
    const archives = (valeur: unknown) =>
      lecture((requete, erreurs) => lireBooleenDeRequete(requete, 'archives', erreurs), {
        archives: valeur,
      });

    expect(archives('true').valeur).toBe(true);
    expect(archives(undefined).valeur).toBe(false);
    expect(archives('oui').erreurs).toEqual(['archives doit valoir true ou false']);
  });

  it('accepte un tri de la liste et refuse les autres', () => {
    const tri = (valeur: unknown) =>
      lecture((requete, erreurs) => lireTri(requete, ['nom', '-nom'] as const, 'nom', erreurs), {
        tri: valeur,
      });

    expect(tri('-nom').valeur).toBe('-nom');
    expect(tri(undefined).valeur).toBe('nom');
    expect(tri('motDePasseHash').erreurs).toEqual(['tri doit valoir nom, -nom']);
  });
});
