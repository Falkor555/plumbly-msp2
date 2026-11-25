import { BadRequestException } from '@nestjs/common';
import {
  analyserLignes,
  clesDeRecherche,
  preparerFichier,
  versReponseAnalyse,
} from './analyse-import.js';
import type { ClientExistant, LigneAnalysee } from './import-clients.types.js';

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

const EN_TETE = 'nom;prenom;email;telephone;adresse;code_postal;ville';
const DUPONT =
  'DUPONT;Marie;marie.dupont@exemple.re;0692 12 34 56;12 rue des Manguiers;97400;Saint-Denis';
const HOARAU =
  'HOARAU;Jean;jean.hoarau@exemple.re;0692 98 76 54;8 avenue de la Victoire;97410;Saint-Pierre';

function fichier(...lignes: string[]): string {
  return [EN_TETE, ...lignes].join('\r\n');
}

/** Préparation puis analyse, avec les clients existants donnés. */
function analyser(contenu: string, existants: ClientExistant[] = []): LigneAnalysee[] {
  return analyserLignes(preparerFichier({ contenu }).lignes, existants);
}

function existant(champs: Partial<ClientExistant> = {}): ClientExistant {
  return { id: 8, telephone: '0692123456', emailClient: null, archive: false, ...champs };
}

describe('analyse d’un fichier de clients', () => {
  describe('ligne valide', () => {
    it('valide une ligne comme POST /clients : téléphone normalisé, champs absents à null', () => {
      expect(analyser(fichier(DUPONT))).toEqual([
        {
          numero: 2,
          resultat: 'VALIDE',
          client: {
            typeClient: 'PARTICULIER',
            nomClient: 'DUPONT',
            prenomClient: 'Marie',
            raisonSociale: null,
            telephone: '0692123456',
            emailClient: 'marie.dupont@exemple.re',
            adresse: {
              rue: '12 rue des Manguiers',
              complement: null,
              codePostal: '97400',
              ville: 'Saint-Denis',
              infosAcces: null,
            },
          },
        },
      ]);
    });

    it('traite une cellule vide ou blanche comme un champ absent', () => {
      const [ligne] = analyser(
        fichier('DUPONT;  ;;0692123456;12 rue des Manguiers;97400;Saint-Denis'),
      );

      expect(ligne).toMatchObject({
        resultat: 'VALIDE',
        client: { prenomClient: null, emailClient: null },
      });
    });

    it('retire l’apostrophe que l’export place devant =, +, - et @', () => {
      const [ligne] = analyser(
        fichier("'=Dupont;'+Marie;;0692123456;'-12 rue;97400;'@Saint-Denis"),
      );

      expect(ligne).toMatchObject({
        resultat: 'VALIDE',
        client: {
          nomClient: '=Dupont',
          prenomClient: '+Marie',
          adresse: { rue: '-12 rue', ville: '@Saint-Denis' },
        },
      });
    });

    it('garde une apostrophe qui ne précède pas une formule', () => {
      const [ligne] = analyser(fichier("'Dupont;L'Ermitage;;0692123456;1 rue;97400;Saint-Denis"));

      expect(ligne).toMatchObject({ client: { nomClient: "'Dupont", prenomClient: "L'Ermitage" } });
    });
  });

  describe('type de client (spécification, 4.3)', () => {
    const avecType = (type: string, nom: string, raison: string) =>
      analyser(
        [
          'type;nom;raison_sociale;telephone;rue;cp;ville',
          `${type};${nom};${raison};0692123456;1 rue;97400;Saint-Denis`,
        ].join('\n'),
      )[0];

    it('lit le type sans tenir compte de la casse', () => {
      expect(avecType('professionnel', '', 'Boulangerie')).toMatchObject({
        resultat: 'VALIDE',
        client: { typeClient: 'PROFESSIONNEL', raisonSociale: 'Boulangerie' },
      });
    });

    it('déduit un professionnel : raison sociale sans nom, type vide', () => {
      expect(avecType('', '', 'Boulangerie')).toMatchObject({
        client: { typeClient: 'PROFESSIONNEL' },
      });
    });

    it('note qu’un type déduit n’a pas été renseigné : une mise à jour ne le changera pas', () => {
      const [deduit, renseigne] = preparerFichier({
        contenu: [
          'type;nom;telephone;rue;cp;ville',
          ';Dupont;0692123456;1 rue;97400;Saint-Denis',
          'particulier;Payet;0692000000;1 rue;97400;Saint-Denis',
        ].join('\n'),
      }).lignes;

      expect([deduit, renseigne]).toMatchObject([
        { typeRenseigne: false },
        { typeRenseigne: true },
      ]);
    });

    it('déduit un particulier dans les autres cas', () => {
      expect(avecType('', 'Dupont', 'Boulangerie')).toMatchObject({
        client: { typeClient: 'PARTICULIER' },
      });
    });

    it('déduit un particulier sans colonne de type', () => {
      const [ligne] = preparerFichier({ contenu: fichier(DUPONT) }).lignes;

      expect(ligne).toMatchObject({ client: { typeClient: 'PARTICULIER' }, typeRenseigne: false });
    });

    it('refuse un type inconnu', () => {
      expect(avecType('ARTISAN', 'Dupont', '')).toEqual({
        numero: 2,
        resultat: 'INVALIDE',
        erreurs: ['typeClient doit valoir PARTICULIER ou PROFESSIONNEL'],
      });
    });
  });

  describe('lignes invalides (RG27)', () => {
    it.each([
      [
        'un téléphone invalide',
        'DUPONT;Marie;;0692;1 rue;97400;Saint-Denis',
        ['telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)'],
      ],
      [
        'un téléphone absent',
        'DUPONT;Marie;;;1 rue;97400;Saint-Denis',
        ['telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)'],
      ],
      [
        'un e-mail invalide',
        'DUPONT;Marie;marie@;0692123456;1 rue;97400;Saint-Denis',
        ['emailClient doit être une adresse e-mail valide'],
      ],
      [
        'un code postal invalide',
        'DUPONT;Marie;;0692123456;1 rue;974;Saint-Denis',
        ['codePostal doit contenir 5 chiffres'],
      ],
      [
        'une rue et une ville absentes',
        'DUPONT;Marie;;0692123456;;97400;',
        ['rue est obligatoire', 'ville est obligatoire'],
      ],
      [
        'un nom absent pour un particulier',
        ';Marie;;0692123456;1 rue;97400;Saint-Denis',
        ['nomClient est obligatoire pour un particulier'],
      ],
      [
        'un nom trop long',
        `${'D'.repeat(101)};Marie;;0692123456;1 rue;97400;Saint-Denis`,
        ['nomClient ne doit pas dépasser 100 caractères'],
      ],
      [
        'un caractère NUL',
        'DUP\u0000ONT;Marie;;0692123456;1 rue;97400;Saint-Denis',
        ['nomClient contient un caractère non autorisé'],
      ],
    ])('rejette %s, en nommant le champ et la règle', (_cas, ligne, erreurs) => {
      expect(analyser(fichier(ligne))).toEqual([{ numero: 2, resultat: 'INVALIDE', erreurs }]);
    });

    it('rejette une ligne qui n’a pas le nombre de colonnes de l’en-tête', () => {
      expect(analyser(fichier('DUPONT;Marie;0692123456'))).toEqual([
        { numero: 2, resultat: 'INVALIDE', erreurs: ['La ligne a 3 colonnes au lieu de 7'] },
      ]);
    });

    it('ne cite jamais la valeur d’une cellule dans un motif', () => {
      const lignes = analyser(
        fichier('Grondin;Hélène;helene@;06 92 XX;9 chemin Secret;9740;Saint-Paul'),
      );

      expect(JSON.stringify(lignes)).not.toMatch(
        /Grondin|Hélène|helene@|06 92 XX|Secret|9740;|Saint-Paul/,
      );
    });

    it('n’empêche pas l’analyse des autres lignes, avec leur numéro dans le fichier', () => {
      const lignes = analyser(fichier(DUPONT, '', 'invalide;;;;;;', HOARAU));

      expect(lignes.map(({ numero, resultat }) => [numero, resultat])).toEqual([
        [2, 'VALIDE'],
        [4, 'INVALIDE'],
        [5, 'VALIDE'],
      ]);
    });
  });

  describe('doublons (RG28)', () => {
    it('reconnaît un client existant au téléphone, écrit autrement (0692 12 34 56)', () => {
      expect(analyser(fichier(DUPONT), [existant({ telephone: '0692123456' })])).toEqual([
        expect.objectContaining({
          numero: 2,
          resultat: 'DOUBLON',
          clientId: 8,
          motif: 'Même téléphone que le client 8',
          clientArchive: false,
        }),
      ]);
    });

    it('reconnaît un client existant à l’e-mail, sans tenir compte de la casse', () => {
      const autre = existant({ telephone: '0262000000', emailClient: 'Marie.DUPONT@Exemple.re' });

      expect(analyser(fichier(DUPONT), [autre])[0]).toMatchObject({
        resultat: 'DOUBLON',
        motif: 'Même e-mail que le client 8',
      });
    });

    it('signale un client existant au même téléphone et au même e-mail', () => {
      const meme = existant({ emailClient: 'marie.dupont@exemple.re' });

      expect(analyser(fichier(DUPONT), [meme])[0]).toMatchObject({
        motif: 'Même téléphone et même e-mail que le client 8',
      });
    });

    it('fait de chaque ligne d’un même client existant un doublon (export réimporté)', () => {
      const deuxAdresses = fichier(DUPONT, DUPONT.replace('12 rue des Manguiers', '3 rue Autre'));

      const lignes = analyser(deuxAdresses, [existant()]);

      expect(lignes.map(({ resultat }) => resultat)).toEqual(['DOUBLON', 'DOUBLON']);
    });

    it('rejette la seconde ligne d’un nouveau client : « Doublon de la ligne N »', () => {
      const memeEmail = HOARAU.replace('jean.hoarau', 'MARIE.DUPONT');

      const lignes = analyser(
        fichier(DUPONT, HOARAU.replace('0692 98 76 54', '0692.12.34.56'), memeEmail),
      );

      expect(lignes).toEqual([
        expect.objectContaining({ numero: 2, resultat: 'VALIDE' }),
        { numero: 3, resultat: 'INVALIDE', erreurs: ['Doublon de la ligne 2'] },
        { numero: 4, resultat: 'INVALIDE', erreurs: ['Doublon de la ligne 2'] },
      ]);
    });

    it('rejette une ligne dont le téléphone désigne un client et l’e-mail un autre', () => {
      const parTelephone = existant({ id: 8 });
      const parEmail = existant({
        id: 9,
        telephone: '0262000000',
        emailClient: 'marie.dupont@exemple.re',
      });

      expect(analyser(fichier(DUPONT), [parTelephone, parEmail])).toEqual([
        { numero: 2, resultat: 'INVALIDE', erreurs: ['Correspond à deux clients différents'] },
      ]);
    });

    it('rejette une ligne dont le téléphone désigne un client existant et l’e-mail une ligne nouvelle', () => {
      const nouveau = HOARAU;
      const melange = DUPONT.replace('marie.dupont', 'jean.hoarau');

      const lignes = analyser(fichier(nouveau, melange), [existant()]);

      expect(lignes[1]).toEqual({
        numero: 3,
        resultat: 'INVALIDE',
        erreurs: ['Correspond à deux clients différents'],
      });
    });

    it('fait d’une ligne qui reprend l’e-mail nouveau d’un doublon un doublon du même client', () => {
      // Client 8 trouvé par son téléphone ; sa ligne apporte un e-mail que la base ne connaît pas.
      const sansEmail = existant({ emailClient: null });
      const memeEmail = HOARAU.replace('jean.hoarau', 'marie.dupont');

      const lignes = analyser(fichier(DUPONT, memeEmail), [sansEmail]);

      expect(lignes.map(({ resultat }) => resultat)).toEqual(['DOUBLON', 'DOUBLON']);
      expect(lignes[1]).toMatchObject({
        clientId: 8,
        motif: 'Même e-mail que la ligne 2, doublon du client 8',
      });
    });

    it('fait d’une ligne qui reprend le téléphone nouveau d’un doublon un doublon du même client', () => {
      // Client 8 trouvé par son e-mail ; sa ligne apporte un téléphone que la base ne connaît pas.
      const parEmail = existant({
        telephone: '0262000000',
        emailClient: 'marie.dupont@exemple.re',
      });
      const memeTelephone = HOARAU.replace('0692 98 76 54', '0692.12.34.56');

      const lignes = analyser(fichier(DUPONT, memeTelephone), [parEmail]);

      expect(lignes[1]).toMatchObject({
        resultat: 'DOUBLON',
        clientId: 8,
        motif: 'Même téléphone que la ligne 2, doublon du client 8',
      });
    });

    it('rejette une ligne qui reprend la clé d’un doublon et désigne un autre client', () => {
      const client8 = existant({ id: 8, emailClient: null });
      const client9 = existant({ id: 9, telephone: '0692987654' });
      // Ligne 3 : e-mail apporté par le doublon du client 8, téléphone du client 9.
      const melange = HOARAU.replace('jean.hoarau', 'marie.dupont');

      const lignes = analyser(fichier(DUPONT, melange), [client8, client9]);

      expect(lignes[1]).toEqual({
        numero: 3,
        resultat: 'INVALIDE',
        erreurs: ['Correspond à deux clients différents'],
      });
    });

    it('signale un client archivé comme doublon qui ne sera pas mis à jour', () => {
      expect(analyser(fichier(DUPONT), [existant({ archive: true })])[0]).toMatchObject({
        resultat: 'DOUBLON',
        clientArchive: true,
        motif: 'Client archivé : il ne sera pas mis à jour',
      });
    });

    it('ne réserve pas le téléphone d’une ligne invalide', () => {
      const invalide = DUPONT.replace('97400', '974');

      const lignes = analyser(fichier(invalide, DUPONT));

      expect(lignes.map(({ resultat }) => resultat)).toEqual(['INVALIDE', 'VALIDE']);
    });
  });

  describe('clesDeRecherche', () => {
    it('donne les téléphones normalisés et les e-mails en minuscules des lignes valides, sans doublon', () => {
      const prepare = preparerFichier({
        contenu: fichier(DUPONT.replace('marie.dupont', 'Marie.Dupont'), DUPONT, 'x;;;;;;', HOARAU),
      });

      expect(clesDeRecherche(prepare)).toEqual({
        telephones: ['0692123456', '0692987654'],
        emails: ['marie.dupont@exemple.re', 'jean.hoarau@exemple.re'],
      });
    });
  });

  describe('fichier entier', () => {
    const ligneNumero = (rang: number) =>
      `Client${rang};;;06${String(rang).padStart(8, '0')};1 rue;97400;Saint-Denis`;

    it('accepte exactement 1 000 lignes de données', () => {
      const lignes = Array.from({ length: 1000 }, (_, rang) => ligneNumero(rang));

      expect(preparerFichier({ contenu: fichier(...lignes) }).lignes).toHaveLength(1000);
    });

    it('refuse 1 001 lignes de données', () => {
      const lignes = Array.from({ length: 1001 }, (_, rang) => ligneNumero(rang));

      expect(messagesDe(() => preparerFichier({ contenu: fichier(...lignes) }))).toEqual([
        'Le fichier dépasse 1 000 lignes de données',
      ]);
    });

    it('refuse un fichier sans ligne de données', () => {
      expect(messagesDe(() => preparerFichier({ contenu: `${EN_TETE}\r\n\r\n` }))).toEqual([
        'Le fichier ne contient aucune ligne de données',
      ]);
    });

    it('ne compte pas les lignes vides dans la limite', () => {
      const lignes = Array.from({ length: 1000 }, (_, rang) => ligneNumero(rang));

      expect(() =>
        preparerFichier({ contenu: `${fichier(...lignes)}\r\n\r\n;;;;;;\r\n` }),
      ).not.toThrow();
    });

    it('applique le séparateur imposé', () => {
      const prepare = preparerFichier({
        contenu: 'nom,telephone,rue,cp,ville\nDupont,0692123456,"1 rue; bât. A",97400,Saint-Denis',
        separateur: ',',
      });

      expect(prepare.lignes[0]).toMatchObject({ client: { adresse: { rue: '1 rue; bât. A' } } });
    });
  });

  describe('versReponseAnalyse', () => {
    it('donne l’aperçu des 10 premières lignes telles que lues, les résultats et les totaux', () => {
      const lignes = Array.from({ length: 11 }, (_, rang) =>
        rang === 3
          ? 'invalide;;;;;;'
          : DUPONT.replace('0692 12 34 56', `06920000${String(rang).padStart(2, '0')}`).replace(
              'marie.dupont',
              `m${rang}`,
            ),
      );
      const prepare = preparerFichier({ contenu: fichier(...lignes) });
      const analysees = analyserLignes(prepare.lignes, [existant({ telephone: '0692000000' })]);

      const reponse = versReponseAnalyse(prepare, analysees);

      expect(reponse.separateur).toBe(';');
      expect(reponse.enTetes).toEqual(EN_TETE.split(';'));
      expect(reponse.correspondance).toMatchObject({ adresse: 'rue', telephone: 'telephone' });
      expect(reponse.colonnesIgnorees).toEqual([]);
      expect(reponse.apercu).toHaveLength(10);
      expect(reponse.apercu[0]).toEqual({
        numero: 2,
        cellules: expect.arrayContaining(['DUPONT']),
      });
      expect(reponse.lignes[0]).toEqual({
        numero: 2,
        resultat: 'DOUBLON',
        clientId: 8,
        motif: 'Même téléphone que le client 8',
      });
      expect(reponse.lignes[1]).toEqual({ numero: 3, resultat: 'VALIDE' });
      expect(reponse.totaux).toEqual({ lignes: 11, valides: 9, doublons: 1, invalides: 1 });
    });

    it('ne renvoie pas les clients lus dans le détail des lignes', () => {
      const prepare = preparerFichier({ contenu: fichier(DUPONT) });

      const reponse = versReponseAnalyse(prepare, analyserLignes(prepare.lignes, []));

      expect(JSON.stringify(reponse.lignes)).not.toContain('Manguiers');
    });
  });
});
