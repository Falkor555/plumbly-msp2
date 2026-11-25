import { BadRequestException } from '@nestjs/common';
import {
  lireCriteresExportClients,
  lireFiltresClients,
  lireFiltresHistorique,
  lireModificationAdresse,
  lireModificationClient,
  lireNouveauClient,
  lireNouvelleAdresse,
} from './clients.validation.js';

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

const ADRESSE = { rue: '12 rue des Lilas', codePostal: '97400', ville: 'Saint-Denis' };
const PARTICULIER = {
  typeClient: 'PARTICULIER',
  nomClient: 'Dupont',
  telephone: '06 92 12 34 56',
  adresse: ADRESSE,
};

describe('validation des clients', () => {
  describe('création', () => {
    it('lit un particulier, normalise le téléphone et complète les champs facultatifs', () => {
      expect(lireNouveauClient(PARTICULIER)).toEqual({
        typeClient: 'PARTICULIER',
        nomClient: 'Dupont',
        prenomClient: null,
        raisonSociale: null,
        telephone: '0692123456',
        emailClient: null,
        adresse: { ...ADRESSE, complement: null, infosAcces: null },
      });
    });

    it('lit un professionnel identifié par sa raison sociale', () => {
      const client = lireNouveauClient({
        typeClient: 'PROFESSIONNEL',
        raisonSociale: '  Boulangerie Grondin ',
        telephone: '0262123456',
        emailClient: 'contact@grondin.re',
        adresse: { ...ADRESSE, complement: 'Bât. B', infosAcces: 'Code 4521' },
      });

      expect(client.raisonSociale).toBe('Boulangerie Grondin');
      expect(client.adresse).toEqual({ ...ADRESSE, complement: 'Bât. B', infosAcces: 'Code 4521' });
    });

    it('refuse un client sans adresse (RG21)', () => {
      const sansAdresse = { ...PARTICULIER, adresse: undefined };

      expect(messagesDe(() => lireNouveauClient(sansAdresse))).toEqual(['adresse est obligatoire']);
    });

    it('nomme les champs de l’adresse en erreur', () => {
      const messages = messagesDe(() =>
        lireNouveauClient({ ...PARTICULIER, adresse: { rue: '', codePostal: '974', pays: 'FR' } }),
      );

      expect(messages).toEqual([
        'Le champ adresse.pays n’est pas autorisé',
        'adresse.rue ne peut pas être vide',
        'adresse.codePostal doit contenir 5 chiffres',
        'adresse.ville est obligatoire',
      ]);
    });

    it('refuse un particulier sans nom', () => {
      const sansNom = { ...PARTICULIER, nomClient: undefined };

      expect(messagesDe(() => lireNouveauClient(sansNom))).toEqual([
        'nomClient est obligatoire pour un particulier',
      ]);
    });

    it('refuse un professionnel sans raison sociale', () => {
      expect(
        messagesDe(() => lireNouveauClient({ ...PARTICULIER, typeClient: 'PROFESSIONNEL' })),
      ).toEqual(['raisonSociale est obligatoire pour un professionnel']);
    });

    it('liste toutes les erreurs du client dans une seule réponse', () => {
      const messages = messagesDe(() =>
        lireNouveauClient({
          typeClient: 'ENTREPRISE',
          nomClient: 'a'.repeat(101),
          telephone: '06-92-12-34-56',
          emailClient: 'pas-un-email',
          adresse: ADRESSE,
        }),
      );

      expect(messages).toEqual([
        'typeClient doit valoir PARTICULIER ou PROFESSIONNEL',
        'nomClient ne doit pas dépasser 100 caractères',
        'telephone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés)',
        'emailClient doit être une adresse e-mail valide',
      ]);
    });

    it('refuse un champ inconnu, comme archive ou id', () => {
      expect(messagesDe(() => lireNouveauClient({ ...PARTICULIER, archive: true }))).toEqual([
        'Le champ archive n’est pas autorisé',
      ]);
    });

    it('accepte les longueurs maximales et un nom d’un seul caractère', () => {
      const client = lireNouveauClient({
        ...PARTICULIER,
        nomClient: 'D',
        prenomClient: 'p'.repeat(100),
        adresse: {
          rue: 'r'.repeat(255),
          complement: 'c'.repeat(255),
          codePostal: '97400',
          ville: 'v'.repeat(100),
          infosAcces: 'i'.repeat(500),
        },
      });

      expect(client.nomClient).toBe('D');
      expect(client.adresse.infosAcces).toHaveLength(500);
    });

    it('refuse des infos d’accès de plus de 500 caractères', () => {
      expect(
        messagesDe(() =>
          lireNouveauClient({
            ...PARTICULIER,
            adresse: { ...ADRESSE, infosAcces: 'i'.repeat(501) },
          }),
        ),
      ).toEqual(['adresse.infosAcces ne doit pas dépasser 500 caractères']);
    });
  });

  describe('modification', () => {
    it('ne garde que les champs envoyés', () => {
      expect(lireModificationClient({ telephone: '06.92.00.00.01' })).toEqual({
        telephone: '0692000001',
      });
      expect(lireModificationClient({})).toEqual({});
    });

    it('efface un champ facultatif avec null', () => {
      expect(lireModificationClient({ prenomClient: null, emailClient: null })).toEqual({
        prenomClient: null,
        emailClient: null,
      });
    });

    it('refuse une chaîne vide, qui effacerait le champ en silence', () => {
      expect(messagesDe(() => lireModificationClient({ prenomClient: '' }))).toEqual([
        'prenomClient ne peut pas être vide',
      ]);
    });

    it('refuse de modifier l’adresse par cette route', () => {
      expect(messagesDe(() => lireModificationClient({ adresse: ADRESSE }))).toEqual([
        'Le champ adresse n’est pas autorisé',
      ]);
    });
  });

  describe('adresses', () => {
    it('lit une nouvelle adresse et complète les champs facultatifs', () => {
      expect(lireNouvelleAdresse(ADRESSE)).toEqual({
        ...ADRESSE,
        complement: null,
        infosAcces: null,
      });
    });

    it('refuse une adresse sans rue ni ville', () => {
      expect(messagesDe(() => lireNouvelleAdresse({ codePostal: '97400' }))).toEqual([
        'rue est obligatoire',
        'ville est obligatoire',
      ]);
    });

    it('modifie seulement les champs envoyés, et efface le complément avec null', () => {
      expect(lireModificationAdresse({ infosAcces: 'Code 9999', complement: null })).toEqual({
        infosAcces: 'Code 9999',
        complement: null,
      });
    });

    it('refuse d’effacer la rue ou la ville, et un champ inconnu', () => {
      expect(messagesDe(() => lireModificationAdresse({ rue: null, ville: '' }))).toEqual([
        'rue ne peut pas être null',
        'ville ne peut pas être vide',
      ]);
      expect(messagesDe(() => lireModificationAdresse({ idClient: 9 }))).toEqual([
        'Le champ idClient n’est pas autorisé',
      ]);
    });
  });

  describe('filtres de la liste', () => {
    it('applique les valeurs par défaut', () => {
      expect(lireFiltresClients({})).toEqual({
        page: 1,
        limit: 20,
        archives: false,
        tri: 'nomAffiche',
      });
    });

    it('lit la recherche, le type et le tri', () => {
      expect(
        lireFiltresClients({
          recherche: ' helene ',
          typeClient: 'PARTICULIER',
          archives: 'true',
          tri: '-creeLe',
          page: '2',
          limit: '50',
        }),
      ).toEqual({
        page: 2,
        limit: 50,
        recherche: 'helene',
        typeClient: 'PARTICULIER',
        archives: true,
        tri: '-creeLe',
      });
    });

    it('refuse une recherche d’un caractère et un tri inconnu', () => {
      expect(messagesDe(() => lireFiltresClients({ recherche: 'h', tri: 'telephone' }))).toEqual([
        'tri doit valoir nomAffiche, -nomAffiche, creeLe, -creeLe',
        'recherche doit contenir au moins 2 caractères',
      ]);
    });

    it('refuse un paramètre inconnu', () => {
      expect(messagesDe(() => lireFiltresClients({ ville: 'Saint-Denis' }))).toEqual([
        'Le champ ville n’est pas autorisé',
      ]);
    });
  });

  describe('filtres de l’export (US32)', () => {
    it('applique les valeurs par défaut de la liste, sans pagination', () => {
      expect(lireCriteresExportClients({})).toEqual({ archives: false, tri: 'nomAffiche' });
    });

    it('lit les mêmes filtres que la liste', () => {
      expect(
        lireCriteresExportClients({
          recherche: ' helene ',
          typeClient: 'PROFESSIONNEL',
          archives: 'true',
          tri: '-creeLe',
        }),
      ).toEqual({
        recherche: 'helene',
        typeClient: 'PROFESSIONNEL',
        archives: true,
        tri: '-creeLe',
      });
    });

    it.each(['page', 'limit'])(
      'refuse le paramètre %s : le fichier contient toute la liste',
      (nom) => {
        expect(messagesDe(() => lireCriteresExportClients({ [nom]: '1' }))).toEqual([
          `Le champ ${nom} n’est pas autorisé`,
        ]);
      },
    );

    it('refuse les mêmes valeurs invalides que la liste', () => {
      expect(
        messagesDe(() => lireCriteresExportClients({ recherche: 'h', typeClient: 'AUTRE' })),
      ).toEqual([
        'recherche doit contenir au moins 2 caractères',
        'typeClient doit valoir PARTICULIER ou PROFESSIONNEL',
      ]);
    });
  });

  describe('filtres de l’historique', () => {
    it('lit plusieurs statuts séparés par des virgules, sans doublon', () => {
      expect(lireFiltresHistorique({ statut: 'PLANIFIEE,EN_COURS,PLANIFIEE' })).toEqual({
        page: 1,
        limit: 20,
        statuts: ['PLANIFIEE', 'EN_COURS'],
      });
    });

    it.each(['', 'PLANIFIEE,', 'planifiee', 'INCONNU'])('refuse le statut %j', (statut) => {
      expect(messagesDe(() => lireFiltresHistorique({ statut }))).toEqual([
        'statut doit contenir un ou plusieurs statuts parmi A_PLANIFIER, PLANIFIEE, EN_COURS, TERMINEE, ANNULEE',
      ]);
    });
  });
});
