import { describe, expect, it } from 'vitest';
import { MESSAGES_TELEPHONE } from '../commun/telephone';
import { fabriquerAdresse, heleneDeTest } from '../test/clientsDeTest';
import {
  MESSAGES_CLIENT,
  messageTropLong,
  type SaisieAdresse,
  type SaisieClient,
  saisieDeLAdresse,
  saisieDuClient,
  validerAdresse,
  validerClient,
  versModificationAdresse,
  versModificationClient,
  versNouveauClient,
  versNouvelleAdresse,
} from './validationClient';

function particulier(surcharge: Partial<SaisieClient> = {}): SaisieClient {
  return {
    typeClient: 'PARTICULIER',
    nomClient: 'Payet',
    prenomClient: 'Hélène',
    raisonSociale: '',
    telephone: '0692 12 34 56',
    emailClient: '',
    ...surcharge,
  };
}

function professionnel(surcharge: Partial<SaisieClient> = {}): SaisieClient {
  return particulier({
    typeClient: 'PROFESSIONNEL',
    nomClient: '',
    prenomClient: '',
    raisonSociale: 'Boulangerie Técher',
    ...surcharge,
  });
}

function adresse(surcharge: Partial<SaisieAdresse> = {}): SaisieAdresse {
  return {
    rue: '12 rue des Lilas',
    complement: '',
    codePostal: '97400',
    ville: 'Saint-Denis',
    infosAcces: '',
    ...surcharge,
  };
}

describe('validation du client (US06)', () => {
  it('US06 : un particulier complet ne porte aucune erreur', () => {
    expect(validerClient(particulier({ emailClient: 'helene@exemple.re' }))).toEqual({});
  });

  it('US06 : un particulier sans nom (ou fait d’espaces) est signalé sur le nom', () => {
    expect(validerClient(particulier({ nomClient: '' }))).toEqual({
      nomClient: MESSAGES_CLIENT.nomObligatoire,
    });
    expect(validerClient(particulier({ nomClient: '   ' }))).toEqual({
      nomClient: 'Saisissez le nom : il est obligatoire pour un particulier.',
    });
  });

  it('US06 : un professionnel exige la raison sociale, pas le nom du contact', () => {
    expect(validerClient(professionnel({ raisonSociale: ' ' }))).toEqual({
      raisonSociale: 'Saisissez la raison sociale : elle est obligatoire pour un professionnel.',
    });
    expect(validerClient(professionnel())).toEqual({});
  });

  it('US06 : un particulier n’est pas jugé sur une raison sociale qu’il ne voit pas', () => {
    expect(validerClient(particulier({ raisonSociale: 'x'.repeat(151) }))).toEqual({});
  });

  it.each([['0692123456'], ['0692 12 34 56'], ['06.92.12.34.56'], [' 0262 41 42 43 ']])(
    'US06 : accepte le téléphone « %s »',
    (telephone) => {
      expect(validerClient(particulier({ telephone }))).toEqual({});
    },
  );

  it.each([
    ['692123456', 'sans le 0'],
    ['1692123456', 'qui ne commence pas par 0'],
    ['06921234567', 'à 11 chiffres'],
    ['06-92-12-34-56', 'avec des tirets'],
    ['0692 12 34 5a', 'avec une lettre'],
    [`0692123456${' '.repeat(11)}`, 'de plus de 20 caractères'],
  ])('US06 : refuse le téléphone « %s » (%s)', (telephone) => {
    expect(validerClient(particulier({ telephone }))).toEqual({
      telephone: MESSAGES_TELEPHONE.invalide,
    });
  });

  it('US06 : un téléphone vide demande de le saisir', () => {
    expect(validerClient(particulier({ telephone: '  ' }))).toEqual({
      telephone:
        'Saisissez le téléphone : 10 chiffres commençant par 0, par exemple 0692 12 34 56.',
    });
  });

  it.each([['helene'], ['helene@exemple'], ['hélène payet@exemple.re'], ['@exemple.re']])(
    'US06 : refuse l’e-mail « %s »',
    (emailClient) => {
      expect(validerClient(particulier({ emailClient }))).toEqual({
        emailClient: 'Saisissez une adresse e-mail valide, par exemple nom@exemple.re.',
      });
    },
  );

  it('US06 : l’e-mail est facultatif', () => {
    expect(validerClient(particulier({ emailClient: '   ' }))).toEqual({});
  });

  it('US06 : contrôle les longueurs maximales après retrait des espaces, comme l’API', () => {
    const saisie = particulier({
      nomClient: `  ${'n'.repeat(100)}  `,
      prenomClient: 'p'.repeat(101),
      emailClient: `${'e'.repeat(250)}@ex.re`,
    });

    expect(validerClient(saisie)).toEqual({
      prenomClient: 'Raccourcissez le prénom : 100 caractères au plus.',
      emailClient: messageTropLong('l’e-mail', 255),
    });
    expect(validerClient(professionnel({ raisonSociale: 'r'.repeat(151) }))).toEqual({
      raisonSociale: 'Raccourcissez la raison sociale : 150 caractères au plus.',
    });
  });

  it('US06 : signale toutes les erreurs d’un coup', () => {
    const erreurs = validerClient(
      particulier({ nomClient: '', telephone: '12', emailClient: 'x' }),
    );

    expect(Object.keys(erreurs)).toEqual(['nomClient', 'telephone', 'emailClient']);
  });
});

describe('validation de l’adresse (US07, RG21)', () => {
  it('US07 : une adresse complète ne porte aucune erreur', () => {
    expect(validerAdresse(adresse({ complement: 'Bât. B', infosAcces: 'Code 4521' }))).toEqual({});
  });

  it('RG21 : la rue, le code postal et la ville sont obligatoires', () => {
    expect(validerAdresse(adresse({ rue: ' ', codePostal: '', ville: '' }))).toEqual({
      rue: 'Saisissez la rue : elle est obligatoire.',
      codePostal: 'Saisissez le code postal : 5 chiffres, par exemple 97400.',
      ville: 'Saisissez la ville : elle est obligatoire.',
    });
  });

  it.each([['9740'], ['974000'], ['97 400'], ['974OO']])(
    'US07 : refuse le code postal « %s »',
    (codePostal) => {
      expect(validerAdresse(adresse({ codePostal }))).toEqual({
        codePostal: 'Le code postal doit contenir 5 chiffres, par exemple 97400.',
      });
    },
  );

  it('US07 : contrôle les longueurs maximales', () => {
    const saisie = adresse({
      rue: 'r'.repeat(256),
      complement: 'c'.repeat(256),
      ville: 'v'.repeat(101),
      infosAcces: 'i'.repeat(501),
    });

    expect(validerAdresse(saisie)).toEqual({
      rue: 'Raccourcissez la rue : 255 caractères au plus.',
      complement: 'Raccourcissez le complément : 255 caractères au plus.',
      ville: 'Raccourcissez la ville : 100 caractères au plus.',
      infosAcces: 'Raccourcissez les informations d’accès : 500 caractères au plus.',
    });
  });

  it('US07 : accepte les longueurs maximales exactes', () => {
    const saisie = adresse({ rue: 'r'.repeat(255), ville: 'v'.repeat(100) });

    expect(validerAdresse(saisie)).toEqual({});
  });
});

describe('corps envoyés à l’API', () => {
  it('US06 : la création omet les champs facultatifs vides et imbrique l’adresse', () => {
    const corps = versNouveauClient(
      particulier({ nomClient: ' Payet ', prenomClient: '', emailClient: '  ' }),
      adresse({ complement: ' ', infosAcces: '' }),
    );

    expect(corps).toEqual({
      typeClient: 'PARTICULIER',
      nomClient: 'Payet',
      telephone: '0692123456',
      adresse: { rue: '12 rue des Lilas', codePostal: '97400', ville: 'Saint-Denis' },
    });
  });

  it('US07 : la création d’un professionnel envoie sa raison sociale et le contact saisi', () => {
    const corps = versNouveauClient(
      professionnel({ prenomClient: 'Paul', emailClient: 'contact@techer.re' }),
      adresse({ complement: 'ZA du Port', infosAcces: 'Livraison par l’arrière' }),
    );

    expect(corps).toEqual({
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Boulangerie Técher',
      prenomClient: 'Paul',
      telephone: '0692123456',
      emailClient: 'contact@techer.re',
      adresse: {
        rue: '12 rue des Lilas',
        complement: 'ZA du Port',
        codePostal: '97400',
        ville: 'Saint-Denis',
        infosAcces: 'Livraison par l’arrière',
      },
    });
  });

  it('US06 : une raison sociale saisie puis masquée (retour à « particulier ») n’est pas envoyée', () => {
    const corps = versNouveauClient(particulier({ raisonSociale: 'Société oubliée' }), adresse());

    expect(corps).not.toHaveProperty('raisonSociale');
  });

  it('US10 : la modification n’envoie que les champs changés, et null pour un champ vidé', () => {
    const helene = heleneDeTest();
    const saisie = { ...saisieDuClient(helene), prenomClient: 'Hélène Marie', emailClient: ' ' };

    expect(versModificationClient(helene, saisie)).toEqual({
      prenomClient: 'Hélène Marie',
      emailClient: null,
    });
  });

  it('US10 : un téléphone retapé avec des espaces n’est pas un changement', () => {
    const helene = heleneDeTest();
    const saisie = { ...saisieDuClient(helene), telephone: '0692 12 34 56' };

    expect(versModificationClient(helene, saisie)).toEqual({});
  });

  it('US10 : passer en professionnel envoie le type et la raison sociale', () => {
    const helene = heleneDeTest();
    const saisie: SaisieClient = {
      ...saisieDuClient(helene),
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Payet Plomberie',
    };

    expect(versModificationClient(helene, saisie)).toEqual({
      typeClient: 'PROFESSIONNEL',
      raisonSociale: 'Payet Plomberie',
    });
  });

  it('US07 : la nouvelle adresse omet le complément et l’accès vides', () => {
    expect(versNouvelleAdresse(adresse({ rue: ' 3 chemin des Tamarins ' }))).toEqual({
      rue: '3 chemin des Tamarins',
      codePostal: '97400',
      ville: 'Saint-Denis',
    });
  });

  it('US07 : la correction n’envoie que les champs changés, et null pour un champ vidé', () => {
    const initiale = fabriquerAdresse({ id: 70, complement: 'Bât. B', infosAcces: 'Code 4521' });
    const saisie = { ...saisieDeLAdresse(initiale), complement: '', infosAcces: 'Code 9999' };

    expect(versModificationAdresse(initiale, saisie)).toEqual({
      complement: null,
      infosAcces: 'Code 9999',
    });
    expect(versModificationAdresse(initiale, saisieDeLAdresse(initiale))).toEqual({});
  });
});
