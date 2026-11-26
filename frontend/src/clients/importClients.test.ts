import { describe, expect, it, vi } from 'vitest';
import { ErreurApi, ErreurReseau } from '../api/erreurs';
import {
  CHAMPS_CLIENT,
  champAffiche,
  choisirChamp,
  erreurDEncodage,
  erreurDeTaille,
  LIBELLES_CHAMPS,
  libelleDuMenu,
  lignesAEnregistrer,
  manqueUnChampObligatoire,
  messageErreurAnalyse,
  messageErreurImport,
  nomDeColonne,
  nombreDeLignes,
  optionsDeChamp,
  TAILLE_MAX_FICHIER,
} from './importClients';

describe('correspondance envoyée à l’API', () => {
  it('US31 : ne contient que la colonne changée par l’utilisateur', () => {
    const suivant = choisirChamp({}, 'remarque', 'infosAcces');

    expect(suivant).toEqual({ remarque: 'infosAcces' });
  });

  it('US31 : garde les choix précédents et remplace celui de la même colonne', () => {
    const choix = choisirChamp(choisirChamp({}, 'Tel', null), 'remarque', 'infosAcces');

    const suivant = choisirChamp(choix, 'remarque', 'complement');

    expect(suivant).toEqual({ Tel: null, remarque: 'complement' });
  });

  it('US31 : un champ déjà choisi pour une autre colonne passe à null pour éviter le 400 « choisi pour plusieurs colonnes »', () => {
    const choix = { Mobile: 'telephone' as const, ville: 'ville' as const };

    const suivant = choisirChamp(choix, 'Tel', 'telephone');

    expect(suivant).toEqual({ Mobile: null, ville: 'ville', Tel: 'telephone' });
  });

  it('US31 : « Ignorer la colonne » ne retire rien aux autres colonnes ignorées', () => {
    const suivant = choisirChamp({ id: null }, 'cree_le', null);

    expect(suivant).toEqual({ id: null, cree_le: null });
  });

  it('US31 : ne modifie pas la correspondance reçue', () => {
    const choix = { Mobile: 'telephone' as const };

    choisirChamp(choix, 'Tel', 'telephone');

    expect(choix).toEqual({ Mobile: 'telephone' });
  });
});

describe('champ affiché dans le menu d’une colonne', () => {
  const analysee = { Nom: 'nomClient' as const, Tel: 'telephone' as const, remarque: null };

  it('US31 : reprend celui de l’analyse quand l’utilisateur n’a rien choisi', () => {
    expect(champAffiche({}, analysee, 'Tel')).toBe('telephone');
    expect(champAffiche({}, analysee, 'remarque')).toBeNull();
  });

  it('US31 : préfère le choix de l’utilisateur, y compris « Ignorer la colonne »', () => {
    expect(champAffiche({ Tel: null }, analysee, 'Tel')).toBeNull();
    expect(champAffiche({ remarque: 'infosAcces' }, analysee, 'remarque')).toBe('infosAcces');
  });

  it('US31 : un en-tête comme « constructor » n’est pas confondu avec une propriété d’objet', () => {
    expect(champAffiche({}, {}, 'constructor')).toBeNull();
  });
});

describe('options du menu d’une colonne', () => {
  it('US31 : propose les onze champs du client, dans l’ordre des menus', () => {
    const options = optionsDeChamp(new Map([['Nom', 'nomClient']]), 'Nom');

    expect(options.map((option) => option.valeur)).toEqual(CHAMPS_CLIENT);
    expect(options).toHaveLength(11);
    expect(options[1]).toEqual({ valeur: 'nomClient', libelle: 'Nom' });
  });

  it('US31 : signale le champ déjà pris par une autre colonne, et celle-ci', () => {
    const champs = new Map([
      ['Tel', 'telephone' as const],
      ['', 'ville' as const],
      ['Mobile', null],
    ]);

    const options = optionsDeChamp(champs, 'Mobile');

    expect(options.find((option) => option.valeur === 'telephone')?.libelle).toBe(
      'Téléphone (pris par « Tel »)',
    );
    expect(options.find((option) => option.valeur === 'ville')?.libelle).toBe(
      'Ville (pris par une colonne sans en-tête)',
    );
  });

  it('US31 : chaque champ a un libellé en français', () => {
    expect(CHAMPS_CLIENT.every((champ) => LIBELLES_CHAMPS[champ].length > 0)).toBe(true);
    expect(LIBELLES_CHAMPS.infosAcces).toBe('Informations d’accès');
  });

  it('US31 : nomme une colonne par son en-tête, ou dit qu’elle n’en a pas', () => {
    expect(nomDeColonne('Tél.')).toBe('« Tél. »');
    expect(nomDeColonne('  ')).toBe('une colonne sans en-tête');
  });

  it('US31 : nomme le menu d’une colonne sans en-tête par son rang dans le fichier', () => {
    expect(libelleDuMenu('Tél.', 2)).toBe('Champ pour la colonne « Tél. »');
    expect(libelleDuMenu('', 2)).toBe('Champ pour la colonne 3, sans en-tête');
  });
});

describe('contrôles du fichier avant envoi', () => {
  it('RG27 : accepte un fichier de 1 000 000 octets tout juste', () => {
    expect(erreurDeTaille(TAILLE_MAX_FICHIER)).toBeNull();
    expect(erreurDeTaille(0)).toBeNull();
  });

  it('RG27 : refuse un fichier d’un octet de plus que 1 000 000', () => {
    expect(erreurDeTaille(TAILLE_MAX_FICHIER + 1)).toBe(
      'Le fichier dépasse la taille acceptée (1 Mo).',
    );
  });

  it('RG27 : repère un fichier qui n’est pas en UTF-8 à son caractère de remplacement', () => {
    expect(erreurDEncodage('nom;ville\nPayet;Saint-Andr�')).toBe(
      'Enregistrez le fichier au format CSV UTF-8',
    );
    expect(erreurDEncodage('nom;ville\nPayet;Saint-André')).toBeNull();
  });
});

describe('nombre de lignes à importer', () => {
  const totaux = { lignes: 6, valides: 3, doublons: 2, invalides: 1 };

  it('RG28 : les doublons ignorés ne comptent pas', () => {
    expect(lignesAEnregistrer(totaux, 'IGNORER')).toBe(3);
  });

  it('RG28 : les doublons comptent quand ils mettent à jour les clients existants', () => {
    expect(lignesAEnregistrer(totaux, 'METTRE_A_JOUR')).toBe(5);
  });

  it('US31 : accorde « ligne » au nombre', () => {
    expect([0, 1, 2].map(nombreDeLignes)).toEqual(['0 ligne', '1 ligne', '2 lignes']);
  });
});

describe('messages d’erreur de l’import', () => {
  const champManquant = new ErreurApi(400, ['Aucune colonne pour le champ obligatoire telephone']);

  it('US31 : reconnaît un champ obligatoire sans colonne, et seulement dans un 400', () => {
    expect(manqueUnChampObligatoire(champManquant)).toBe(true);
    expect(manqueUnChampObligatoire(new ErreurApi(400, ['Le fichier est vide']))).toBe(false);
    expect(manqueUnChampObligatoire(new ErreurApi(409, ['Aucune colonne pour x']))).toBe(false);
    expect(manqueUnChampObligatoire(new Error('Aucune colonne pour x'))).toBe(false);
  });

  it('US31 : affiche tel quel le 400 de l’analyse, messages ligne par ligne', () => {
    const erreur = new ErreurApi(400, [
      'Aucune colonne pour le champ obligatoire telephone',
      'Aucune colonne pour le champ obligatoire ville',
    ]);

    expect(messageErreurAnalyse(erreur)).toBe(
      'Aucune colonne pour le champ obligatoire telephone\nAucune colonne pour le champ obligatoire ville',
    );
  });

  it('US31 : remplace le texte technique d’un 413 par un message clair', () => {
    const erreur = new ErreurApi(413, ['request entity too large']);

    expect(messageErreurAnalyse(erreur)).toBe('Le fichier dépasse la taille acceptée (1 Mo).');
    expect(messageErreurImport(erreur)).toBe('Le fichier dépasse la taille acceptée (1 Mo).');
  });

  it('RG29 : une erreur du serveur à l’import dit qu’aucun client n’a été enregistré', () => {
    const erreur = new ErreurApi(500, ['Internal server error']);

    expect(messageErreurImport(erreur)).toBe(
      'L’import a échoué : aucun client du fichier n’a été enregistré. Réessayez plus tard.',
    );
  });

  it.each([502, 503, 504])(
    'RG29 : un %i d’un intermédiaire ne prétend pas que rien n’a été enregistré et invite à relire la liste',
    (statut) => {
      const erreur = new ErreurApi(statut, ['Gateway Timeout']);

      const message = messageErreurImport(erreur);

      expect(message).toBe(
        'Le serveur n’a pas confirmé l’import : des clients ont pu être enregistrés. Rechargez la liste avant de réessayer ; les clients déjà présents seront reconnus comme doublons.',
      );
      expect(message).not.toContain('aucun client');
    },
  );

  it('US31 : le 409 d’un import déjà en cours s’affiche tel quel', () => {
    const message = 'Un import est déjà en cours, réessayez dans un instant.';

    expect(messageErreurImport(new ErreurApi(409, [message]))).toBe(message);
  });

  it('US31 : une panne réseau garde son message, sans prétendre que rien n’a été enregistré', () => {
    expect(messageErreurImport(new ErreurReseau(new TypeError('fetch failed')))).toBe(
      'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.',
    );
  });

  it('US31 : une erreur du front est journalisée et affichée de façon générique', () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new TypeError('x is undefined');

    const message = messageErreurAnalyse(cause);

    expect(message).toBe('Une erreur est survenue. Réessayez plus tard.');
    expect(journal).toHaveBeenCalledWith('Analyse du fichier impossible', cause);
  });
});
