import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { enDataUrl, fabriquerPng } from '../../test/support/fabriquer-png.js';
import type { UtilisateurConnecte } from '../commun/autorisation/utilisateur-connecte.js';
import type { Horloge } from '../commun/horloge.js';
import type { StatutIntervention } from '../generated/prisma/client.ts';
import type { JournalDesActions } from '../journal/journal-des-actions.js';
import { calculerEmpreinte } from './empreinte-signature.js';
import type { InterventionDetaillee } from './intervention-detaillee.js';
import type {
  AdresseUtilisable,
  InterventionsRepository,
  InterventionVerrouillee,
  OperationsDeCreation,
  OperationsSurIntervention,
  SignatureLue,
} from './interventions.repository.js';
import { InterventionsService } from './interventions.service.js';
import { lireImagePng } from './signature-png.js';

// Lundi 7 décembre 2026, 9 h à La Réunion.
const MAINTENANT = new Date('2026-12-07T09:00:00+04:00');

const GESTIONNAIRE: UtilisateurConnecte = { id: 3, role: 'GESTIONNAIRE' };
const KEVIN: UtilisateurConnecte = { id: 7, role: 'TECHNICIEN' };
const MATHIEU: UtilisateurConnecte = { id: 8, role: 'TECHNICIEN' };

const NOUVELLE = {
  adresseId: 15,
  typeInterventionId: 1,
  description: 'Fuite sous l’évier',
  urgence: 'NORMALE' as const,
};

/** Intervention telle que Prisma la renvoie, dans la tournée de Kévin (compte 7) si planifiée. */
function interventionDetaillee(
  statut: InterventionDetaillee['statut'] = 'A_PLANIFIER',
): InterventionDetaillee {
  const planifiee = statut !== 'A_PLANIFIER' && statut !== 'ANNULEE';
  return {
    id: 42,
    description: 'Fuite',
    urgence: 'NORMALE',
    statut,
    dureeEstimeeMin: 60,
    debutPrevu: planifiee ? new Date('2026-12-07T10:00:00+04:00') : null,
    finPrevue: planifiee ? new Date('2026-12-07T11:00:00+04:00') : null,
    ordreTournee: planifiee ? 1 : null,
    compteRendu: null,
    motifAnnulation: null,
    demarreeLe: null,
    termineeLe: null,
    annuleeLe: null,
    creeLe: MAINTENANT,
    majLe: MAINTENANT,
    idAdresse: 15,
    idTypeIntervention: 1,
    idCreateur: 3,
    idTournee: planifiee ? 5 : null,
    typeIntervention: { id: 1, libelle: 'Fuite', dureeDefautMin: 60 },
    adresse: {
      id: 15,
      rue: '1 rue de Paris',
      complement: null,
      codePostal: '97400',
      ville: 'Saint-Denis',
      infosAcces: null,
      archive: false,
      archiveLe: null,
      idClient: 8,
      client: {
        id: 8,
        typeClient: 'PARTICULIER',
        nomClient: 'Grondin',
        prenomClient: 'Hélène',
        raisonSociale: null,
        telephone: '0262000000',
        emailClient: null,
        archive: false,
        archiveLe: null,
        creeLe: MAINTENANT,
        majLe: MAINTENANT,
      },
    },
    createur: { id: 3, nom: 'Payet', prenom: 'Céline' },
    tournee: planifiee
      ? {
          id: 5,
          dateTournee: new Date('2026-12-07T00:00:00Z'),
          creeLe: MAINTENANT,
          idTechnicien: 2,
          idCreateur: 3,
          technicien: {
            id: 2,
            telephone: '0692000001',
            couleurPlanning: '#0F766E',
            archive: false,
            archiveLe: null,
            idUtilisateur: KEVIN.id,
            utilisateur: { nom: 'Hoarau', prenom: 'Kévin' },
          },
        }
      : null,
    signature: null,
  };
}

/** Ligne verrouillée : par défaut, 2ᵉ de la tournée 5 de Kévin, aujourd'hui à 10 h, 60 minutes. */
function verrouillee(
  statut: StatutIntervention,
  autres: Partial<InterventionVerrouillee> = {},
): InterventionVerrouillee {
  const dansUneTournee = statut === 'PLANIFIEE' || statut === 'EN_COURS' || statut === 'TERMINEE';
  return {
    id: 42,
    statut,
    idTournee: dansUneTournee ? 5 : null,
    ordreTournee: dansUneTournee ? 2 : null,
    debutPrevu: dansUneTournee ? new Date('2026-12-07T10:00:00+04:00') : null,
    dureeEstimeeMin: 60,
    ...autres,
  };
}

const TOURNEE_DU_JOUR = { id: 5, dateTournee: new Date('2026-12-07T00:00:00Z'), idTechnicien: 2 };

function creerService({
  adresse = { adresseArchivee: false, clientArchive: false },
  dureeParDefaut = 45,
  intervention = interventionDetaillee(),
  etat = verrouillee('PLANIFIEE'),
  idTourneeLue = etat?.idTournee,
  dateTournee = '2026-12-07',
  maintenant = MAINTENANT,
  signee = false,
  signatureLue = null,
  echecALaValidation = false,
}: {
  adresse?: AdresseUtilisable | null;
  dureeParDefaut?: number | null;
  intervention?: InterventionDetaillee | null;
  /** Ligne lue sous verrou ; null si l'intervention n'existe pas. */
  etat?: InterventionVerrouillee | null;
  /** Tournée lue avant les verrous ; undefined si l'intervention n'existe pas. */
  idTourneeLue?: number | null;
  dateTournee?: string;
  maintenant?: Date;
  /** Une signature existe déjà pour l'intervention verrouillée (RG33). */
  signee?: boolean;
  /** Signature relue par GET …/signature ; null si l'intervention n'est pas signée. */
  signatureLue?: SignatureLue | null;
  /** La transaction échoue au moment d'être validée, après toutes les écritures. */
  echecALaValidation?: boolean;
} = {}) {
  // Suit l'ordre des appels : verrous, écritures, validation de la transaction, journal.
  const evenements: string[] = [];
  const noter =
    <T>(nom: string, valeur: T) =>
    (): Promise<T> => {
      evenements.push(nom);
      return Promise.resolve(valeur);
    };
  const creation: OperationsDeCreation = {
    verrouillerAdresse: vi.fn().mockResolvedValue(adresse),
    trouverDureeParDefaut: vi.fn().mockResolvedValue(dureeParDefaut),
    creer: vi.fn().mockResolvedValue(42),
  };
  const operations: OperationsSurIntervention = {
    verrouillerAdresse: creation.verrouillerAdresse,
    trouverDureeParDefaut: creation.trouverDureeParDefaut,
    lireIdTournee: vi.fn().mockResolvedValue(etat === null ? undefined : idTourneeLue),
    verrouillerTechnicienDeLaTournee: vi.fn(noter('verrou technicien', 2)),
    verrouillerTournee: vi.fn(
      noter('verrou tournée', {
        ...TOURNEE_DU_JOUR,
        dateTournee: new Date(`${dateTournee}T00:00:00Z`),
      }),
    ),
    verrouillerIntervention: vi.fn(noter('verrou intervention', etat)),
    lireAffectation: vi.fn().mockResolvedValue({
      dateTournee: new Date(`${dateTournee}T00:00:00Z`),
      idTechnicien: 2,
      idCompteDuTechnicien: KEVIN.id,
    }),
    listerInterventionsDuTechnicien: vi.fn().mockResolvedValue([]),
    listerIndisponibilites: vi.fn().mockResolvedValue([]),
    decalerRangs: vi.fn(noter('décalage des rangs', undefined)),
    modifier: vi.fn(noter('modification', undefined)),
    annuler: vi.fn(noter('annulation', undefined)),
    demarrer: vi.fn(noter('démarrage', undefined)),
    terminer: vi.fn(noter('fin', undefined)),
    enregistrerCompteRendu: vi.fn(noter('compte rendu', undefined)),
    estSignee: vi.fn(noter('lecture de la signature', signee)),
    enregistrerSignature: vi.fn(noter('signature', undefined)),
  };
  const depot = {
    rechercher: vi.fn().mockResolvedValue({ interventions: [], total: 0 }),
    trouver: vi.fn().mockResolvedValue(intervention),
    trouverSignature: vi.fn().mockResolvedValue(signatureLue),
    creerIntervention: vi.fn((travail: (operations: OperationsDeCreation) => Promise<number>) =>
      travail(creation),
    ),
    modifierIntervention: vi.fn(
      async <T>(travail: (operations: OperationsSurIntervention) => Promise<T>) => {
        const resultat = await travail(operations);
        if (echecALaValidation) {
          throw new Error('Échec de la validation de la transaction');
        }
        evenements.push('transaction validée');
        return resultat;
      },
    ),
  };
  const journal = { enregistrer: vi.fn(noter('journal', undefined)), historiqueDe: vi.fn() };
  const horloge = { maintenant: () => maintenant } as Horloge;
  const service = new InterventionsService(
    depot as unknown as InterventionsRepository,
    horloge,
    journal as unknown as JournalDesActions,
  );
  return { service, depot, creation, operations, journal, evenements };
}

describe('InterventionsService : export CSV (US29)', () => {
  const CRITERES = { tri: '-urgence' as const, statuts: ['PLANIFIEE' as const] };

  function interventions(nombre: number): InterventionDetaillee[] {
    return Array.from({ length: nombre }, (_, rang) => ({
      ...interventionDetaillee('PLANIFIEE'),
      id: rang + 1,
    }));
  }

  it('lit toute la liste filtrée avec le tri de la liste, sans pagination de 100', async () => {
    const { service, depot } = creerService();

    await service.exporter(CRITERES, GESTIONNAIRE, ['statut']);

    expect(depot.rechercher).toHaveBeenCalledWith({ ...CRITERES, page: 1, limit: 5001 });
  });

  it('renvoie le fichier interventions-AAAA-MM-JJ.csv, une ligne par intervention', async () => {
    const { service, depot } = creerService();
    depot.rechercher.mockResolvedValue({ interventions: interventions(2), total: 2 });

    const fichier = await service.exporter(CRITERES, GESTIONNAIRE, []);

    expect(fichier.nom).toBe('interventions-2026-12-07.csv');
    expect(fichier.contenu.split('\r\n').slice(1, -1)).toEqual([
      '1;2026-12-07;Hélène Grondin;97400;Saint-Denis;Fuite;Fuite;NORMALE;PLANIFIEE;60;' +
        '2026-12-07 10:00;Kévin Hoarau;1;;non',
      '2;2026-12-07;Hélène Grondin;97400;Saint-Denis;Fuite;Fuite;NORMALE;PLANIFIEE;60;' +
        '2026-12-07 10:00;Kévin Hoarau;1;;non',
    ]);
  });

  it('journalise EXPORT_CSV une fois, avec le nombre de lignes et le nom des filtres seulement', async () => {
    const { service, depot, journal } = creerService();
    depot.rechercher.mockResolvedValue({ interventions: interventions(3), total: 3 });

    await service.exporter(CRITERES, GESTIONNAIRE, ['statut', 'tri']);

    expect(journal.enregistrer).toHaveBeenCalledTimes(1);
    expect(journal.enregistrer).toHaveBeenCalledWith({
      type: 'EXPORT_CSV',
      auteur: { id: 3, role: 'GESTIONNAIRE' },
      ressource: 'interventions',
      lignes: 3,
      filtres: ['statut', 'tri'],
    });
  });

  it('accepte exactement 5 000 lignes', async () => {
    const { service, depot, journal } = creerService();
    depot.rechercher.mockResolvedValue({ interventions: interventions(5000), total: 5000 });

    await service.exporter(CRITERES, GESTIONNAIRE, []);

    expect(journal.enregistrer).toHaveBeenCalledWith(expect.objectContaining({ lignes: 5000 }));
  });

  it('refuse 5 001 lignes (400) sans rien journaliser', async () => {
    const { service, depot, journal } = creerService();
    depot.rechercher.mockResolvedValue({ interventions: interventions(5001), total: 9000 });

    await expect(service.exporter(CRITERES, GESTIONNAIRE, [])).rejects.toThrow(
      new BadRequestException('L’export dépasse 5 000 lignes : affinez les filtres.'),
    );
    expect(journal.enregistrer).not.toHaveBeenCalled();
  });
});

describe('InterventionsService : lecture et création', () => {
  describe('creer (US14, RG01)', () => {
    it('reprend la durée par défaut du type quand aucune durée n’est envoyée', async () => {
      const { service, creation } = creerService({ dureeParDefaut: 45 });

      await service.creer(NOUVELLE, GESTIONNAIRE);

      expect(creation.creer).toHaveBeenCalledWith({
        idAdresse: 15,
        idTypeIntervention: 1,
        idCreateur: GESTIONNAIRE.id,
        description: 'Fuite sous l’évier',
        urgence: 'NORMALE',
        dureeEstimeeMin: 45,
      });
    });

    it('garde la durée envoyée plutôt que celle du type', async () => {
      const { service, creation } = creerService({ dureeParDefaut: 45 });

      await service.creer({ ...NOUVELLE, dureeEstimeeMin: 90 }, GESTIONNAIRE);

      expect(creation.creer).toHaveBeenCalledWith(expect.objectContaining({ dureeEstimeeMin: 90 }));
    });

    it('renvoie l’intervention créée, à planifier', async () => {
      const { service } = creerService();

      const creee = await service.creer(NOUVELLE, GESTIONNAIRE);

      expect(creee).toMatchObject({ id: 42, statut: 'A_PLANIFIER', tournee: null });
    });

    it.each<[string, AdresseUtilisable | null, string]>([
      ['inexistante', null, 'Adresse inexistante.'],
      [
        'archivée',
        { adresseArchivee: true, clientArchive: false },
        'Cette adresse est archivée : choisissez une adresse en service du client.',
      ],
      [
        'd’un client archivé',
        { adresseArchivee: false, clientArchive: true },
        'Ce client est archivé : on ne peut plus lui rattacher d’intervention.',
      ],
    ])('refuse en 400 une adresse %s, sans rien créer', async (_cas, adresse, message) => {
      const { service, creation } = creerService({ adresse });

      await expect(service.creer(NOUVELLE, GESTIONNAIRE)).rejects.toThrow(
        new BadRequestException(message),
      );
      expect(creation.creer).not.toHaveBeenCalled();
    });

    it('refuse en 400 un type inexistant, sans rien créer', async () => {
      const { service, creation } = creerService({ dureeParDefaut: null });

      await expect(service.creer(NOUVELLE, GESTIONNAIRE)).rejects.toThrow(
        new BadRequestException('Type d’intervention inexistant.'),
      );
      expect(creation.creer).not.toHaveBeenCalled();
    });

    it('verrouille l’adresse avant de créer', async () => {
      const { service, creation } = creerService();

      await service.creer(NOUVELLE, GESTIONNAIRE);

      expect(vi.mocked(creation.verrouillerAdresse).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(creation.creer).mock.invocationCallOrder[0],
      );
    });
  });

  describe('consulter (US14, US24)', () => {
    it('répond 404 pour une intervention inexistante', async () => {
      const { service } = creerService({ intervention: null });

      await expect(service.consulter(99, GESTIONNAIRE)).rejects.toThrow(NotFoundException);
    });

    it('montre toute intervention à un gestionnaire', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('A_PLANIFIER') });

      await expect(service.consulter(42, GESTIONNAIRE)).resolves.toMatchObject({ id: 42 });
    });

    it('montre au technicien une intervention de sa tournée', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('PLANIFIEE') });

      await expect(service.consulter(42, KEVIN)).resolves.toMatchObject({
        tournee: { technicien: { nom: 'Hoarau' } },
      });
    });

    it('répond 403 au technicien pour l’intervention d’un collègue', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('PLANIFIEE') });

      await expect(service.consulter(42, MATHIEU)).rejects.toThrow(ForbiddenException);
    });

    it('répond 403 au technicien pour une intervention à planifier', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('A_PLANIFIER') });

      await expect(service.consulter(42, KEVIN)).rejects.toThrow(ForbiddenException);
    });

    it('répond 404 au technicien avant de vérifier l’affectation', async () => {
      const { service } = creerService({ intervention: null });

      await expect(service.consulter(99, KEVIN)).rejects.toThrow(NotFoundException);
    });
  });

  it('pagine la liste selon le contrat { data, meta }', async () => {
    const { service, depot } = creerService();
    depot.rechercher.mockResolvedValue({ interventions: [interventionDetaillee()], total: 41 });

    const page = await service.lister({ page: 2, limit: 20, tri: '-urgence' });

    expect(page.meta).toEqual({ page: 2, limit: 20, total: 41, totalPages: 3 });
    expect(page.data).toHaveLength(1);
  });
});

describe('InterventionsService : modification (US16)', () => {
  it.each<StatutIntervention>(['EN_COURS', 'TERMINEE', 'ANNULEE'])(
    'refuse en 400 de modifier une intervention %s, sans rien écrire',
    async (statut) => {
      const { service, operations } = creerService({ etat: verrouillee(statut) });

      await expect(service.modifier(42, { description: 'Autre' })).rejects.toThrow(
        BadRequestException,
      );
      expect(operations.modifier).not.toHaveBeenCalled();
    },
  );

  it('refuse en 400 de changer l’adresse d’une intervention planifiée', async () => {
    const { service, operations } = creerService({ etat: verrouillee('PLANIFIEE') });

    await expect(service.modifier(42, { adresseId: 16 })).rejects.toThrow(
      'L’adresse d’une intervention planifiée ne peut pas changer : retirez-la d’abord de sa tournée.',
    );
    expect(operations.modifier).not.toHaveBeenCalled();
  });

  it('change l’adresse d’une intervention à planifier après avoir vérifié la nouvelle', async () => {
    const { service, operations } = creerService({ etat: verrouillee('A_PLANIFIER') });

    await service.modifier(42, { adresseId: 16, typeInterventionId: 2, urgence: 'URGENTE' });

    expect(operations.verrouillerAdresse).toHaveBeenCalledWith(16);
    expect(operations.modifier).toHaveBeenCalledWith(42, {
      idAdresse: 16,
      idTypeIntervention: 2,
      urgence: 'URGENTE',
    });
  });

  it('refuse en 400 une nouvelle adresse archivée', async () => {
    const { service } = creerService({
      etat: verrouillee('A_PLANIFIER'),
      adresse: { adresseArchivee: true, clientArchive: false },
    });

    await expect(service.modifier(42, { adresseId: 16 })).rejects.toThrow(BadRequestException);
  });

  it('refuse en 400 un type inexistant', async () => {
    const { service } = creerService({ etat: verrouillee('A_PLANIFIER'), dureeParDefaut: null });

    await expect(service.modifier(42, { typeInterventionId: 99 })).rejects.toThrow(
      'Type d’intervention inexistant.',
    );
  });

  it('verrouille technicien, tournée puis intervention, comme l’affectation', async () => {
    const { service, evenements } = creerService({ etat: verrouillee('PLANIFIEE') });

    await service.modifier(42, { description: 'Autre' });

    expect(evenements).toEqual([
      'verrou technicien',
      'verrou tournée',
      'verrou intervention',
      'modification',
      'transaction validée',
    ]);
  });

  it('ne verrouille que l’intervention quand elle n’est dans aucune tournée', async () => {
    const { service, evenements } = creerService({ etat: verrouillee('A_PLANIFIER') });

    await service.modifier(42, { dureeEstimeeMin: 90 });

    expect(evenements).toEqual(['verrou intervention', 'modification', 'transaction validée']);
  });

  it('répond 409 si l’intervention a changé de tournée entre la lecture et le verrou', async () => {
    const { service, operations } = creerService({
      etat: verrouillee('A_PLANIFIER'),
      idTourneeLue: 5,
    });

    await expect(service.modifier(42, { description: 'Autre' })).rejects.toThrow(
      new ConflictException('L’intervention a été modifiée entre-temps, rechargez la page.'),
    );
    expect(operations.modifier).not.toHaveBeenCalled();
  });

  it('répond 404 pour une intervention inexistante', async () => {
    const { service } = creerService({ etat: null });

    await expect(service.modifier(99, { description: 'Autre' })).rejects.toThrow(NotFoundException);
  });

  describe('nouvelle durée d’une intervention planifiée (RG09 à RG11)', () => {
    it('vérifie le créneau allongé, sans compter l’intervention elle-même', async () => {
      const { service, operations } = creerService({ etat: verrouillee('PLANIFIEE') });

      await service.modifier(42, { dureeEstimeeMin: 90 });

      expect(operations.listerInterventionsDuTechnicien).toHaveBeenCalledWith(
        2,
        {
          debut: new Date('2026-12-07T10:00:00+04:00'),
          fin: new Date('2026-12-07T11:30:00+04:00'),
        },
        42,
      );
      expect(operations.modifier).toHaveBeenCalledWith(42, { dureeEstimeeMin: 90 });
    });

    it('répond 409 si le créneau allongé chevauche l’intervention suivante', async () => {
      const { service, operations } = creerService({ etat: verrouillee('PLANIFIEE') });
      vi.mocked(operations.listerInterventionsDuTechnicien).mockResolvedValue([
        {
          id: 43,
          debut: new Date('2026-12-07T11:00:00+04:00'),
          fin: new Date('2026-12-07T12:00:00+04:00'),
        },
      ]);

      await expect(service.modifier(42, { dureeEstimeeMin: 90 })).rejects.toThrow(
        ConflictException,
      );
      expect(operations.modifier).not.toHaveBeenCalled();
    });

    it('répond 409 si le créneau allongé tombe sur une indisponibilité', async () => {
      const { service, operations } = creerService({ etat: verrouillee('PLANIFIEE') });
      vi.mocked(operations.listerIndisponibilites).mockResolvedValue([
        {
          debut: new Date('2026-12-07T11:00:00+04:00'),
          fin: new Date('2026-12-07T15:00:00+04:00'),
          motif: 'Médecin',
        },
      ]);

      await expect(service.modifier(42, { dureeEstimeeMin: 90 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('répond 400 si le créneau allongé finit après 19 h', async () => {
      const { service } = creerService({
        etat: verrouillee('PLANIFIEE', { debutPrevu: new Date('2026-12-07T18:00:00+04:00') }),
      });

      await expect(service.modifier(42, { dureeEstimeeMin: 90 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ne vérifie aucun créneau pour une intervention à planifier', async () => {
      const { service, operations } = creerService({ etat: verrouillee('A_PLANIFIER') });

      await service.modifier(42, { dureeEstimeeMin: 720 });

      expect(operations.listerInterventionsDuTechnicien).not.toHaveBeenCalled();
    });
  });
});

describe('InterventionsService : annulation (US16, RG05)', () => {
  it('sort l’intervention de sa tournée et fait remonter les suivantes', async () => {
    const { service, operations } = creerService({ etat: verrouillee('PLANIFIEE') });

    await service.annuler(42, { motif: 'Client absent' }, GESTIONNAIRE);

    expect(operations.annuler).toHaveBeenCalledWith(42, { motif: 'Client absent', le: MAINTENANT });
    expect(operations.decalerRangs).toHaveBeenCalledWith(5, 3, -1);
  });

  it('ne décale aucun rang pour une intervention à planifier', async () => {
    const { service, operations } = creerService({ etat: verrouillee('A_PLANIFIER') });

    await service.annuler(42, { motif: 'Doublon' }, GESTIONNAIRE);

    expect(operations.annuler).toHaveBeenCalled();
    expect(operations.decalerRangs).not.toHaveBeenCalled();
  });

  it('journalise INTERVENTION_ANNULEE avec le motif, après la validation de la transaction', async () => {
    const { service, journal, evenements } = creerService({ etat: verrouillee('EN_COURS') });

    await service.annuler(42, { motif: 'Pièce indisponible' }, GESTIONNAIRE);

    expect(journal.enregistrer).toHaveBeenCalledWith({
      type: 'INTERVENTION_ANNULEE',
      auteur: { id: GESTIONNAIRE.id, role: 'GESTIONNAIRE' },
      interventionId: 42,
      ancienStatut: 'EN_COURS',
      motif: 'Pièce indisponible',
    });
    expect(evenements.slice(-2)).toEqual(['transaction validée', 'journal']);
  });

  it.each<StatutIntervention>(['TERMINEE', 'ANNULEE'])(
    'refuse en 400 d’annuler une intervention %s, sans rien écrire ni journaliser',
    async (statut) => {
      const { service, operations, journal } = creerService({ etat: verrouillee(statut) });

      await expect(service.annuler(42, { motif: 'Erreur' }, GESTIONNAIRE)).rejects.toThrow(
        BadRequestException,
      );
      expect(operations.annuler).not.toHaveBeenCalled();
      expect(journal.enregistrer).not.toHaveBeenCalled();
    },
  );

  it('répond 409 sans journaliser si l’intervention a été retirée entre-temps', async () => {
    const { service, journal } = creerService({
      etat: verrouillee('A_PLANIFIER'),
      idTourneeLue: 5,
    });

    await expect(service.annuler(42, { motif: 'Erreur' }, GESTIONNAIRE)).rejects.toThrow(
      ConflictException,
    );
    expect(journal.enregistrer).not.toHaveBeenCalled();
  });
});

describe('InterventionsService : démarrage et fin sur le terrain (US17, RG03)', () => {
  it('démarre l’intervention à l’heure de l’horloge et journalise le changement de statut', async () => {
    const { service, operations, journal, evenements } = creerService({
      etat: verrouillee('PLANIFIEE'),
    });

    await service.demarrer(42, KEVIN);

    expect(operations.demarrer).toHaveBeenCalledWith(42, MAINTENANT);
    expect(journal.enregistrer).toHaveBeenCalledWith({
      type: 'STATUT_MODIFIE',
      auteur: { id: KEVIN.id, role: 'TECHNICIEN' },
      interventionId: 42,
      ancienStatut: 'PLANIFIEE',
      nouveauStatut: 'EN_COURS',
    });
    expect(evenements).toEqual([
      'verrou intervention',
      'démarrage',
      'transaction validée',
      'journal',
    ]);
  });

  it('répond 403 à un technicien qui n’est pas celui de la tournée, sans rien écrire', async () => {
    const { service, operations, journal } = creerService({ etat: verrouillee('PLANIFIEE') });

    await expect(service.demarrer(42, MATHIEU)).rejects.toThrow(ForbiddenException);
    expect(operations.demarrer).not.toHaveBeenCalled();
    expect(journal.enregistrer).not.toHaveBeenCalled();
  });

  it('RG24 : répond 400 si la tournée n’est pas celle du jour à La Réunion', async () => {
    const { service, operations } = creerService({
      etat: verrouillee('PLANIFIEE'),
      dateTournee: '2026-12-08',
    });

    await expect(service.demarrer(42, KEVIN)).rejects.toThrow(
      'Cette intervention est prévue le 2026-12-08 : elle ne peut être démarrée que ce jour-là.',
    );
    expect(operations.demarrer).not.toHaveBeenCalled();
  });

  it('RG24 : le jour est celui de La Réunion, pas le jour UTC (mardi 2 h, encore lundi en UTC)', async () => {
    const mardi2h = new Date('2026-12-08T02:00:00+04:00');
    const { service, operations } = creerService({
      etat: verrouillee('PLANIFIEE'),
      dateTournee: '2026-12-08',
      maintenant: mardi2h,
    });

    await service.demarrer(42, KEVIN);

    expect(operations.demarrer).toHaveBeenCalledWith(42, mardi2h);
  });

  it('RG24 : à mardi 2 h à La Réunion, la tournée de lundi n’est plus celle du jour', async () => {
    const { service } = creerService({
      etat: verrouillee('PLANIFIEE'),
      dateTournee: '2026-12-07',
      maintenant: new Date('2026-12-08T02:00:00+04:00'),
    });

    await expect(service.demarrer(42, KEVIN)).rejects.toThrow(
      'Cette intervention est prévue le 2026-12-07 : elle ne peut être démarrée que ce jour-là.',
    );
  });
  it('US17 : répond 400 (et non 403) pour une intervention à planifier, sans technicien', async () => {
    const { service } = creerService({ etat: verrouillee('A_PLANIFIER') });

    await expect(service.demarrer(42, KEVIN)).rejects.toThrow(
      'Impossible de démarrer une intervention à planifier.',
    );
  });

  it('répond 403 avant 400 pour l’intervention terminée d’un collègue', async () => {
    const { service } = creerService({ etat: verrouillee('TERMINEE') });

    await expect(service.demarrer(42, MATHIEU)).rejects.toThrow(ForbiddenException);
  });

  it('répond 404 pour une intervention inexistante', async () => {
    const { service } = creerService({ etat: null });

    await expect(service.demarrer(99, KEVIN)).rejects.toThrow(NotFoundException);
  });

  it('termine l’intervention en cours à l’heure de l’horloge, avec le compte rendu', async () => {
    const { service, operations, journal } = creerService({ etat: verrouillee('EN_COURS') });

    await service.terminer(42, { compteRendu: 'Joint changé' }, KEVIN);

    expect(operations.terminer).toHaveBeenCalledWith(42, {
      le: MAINTENANT,
      compteRendu: 'Joint changé',
    });
    expect(journal.enregistrer).toHaveBeenCalledWith(
      expect.objectContaining({ ancienStatut: 'EN_COURS', nouveauStatut: 'TERMINEE' }),
    );
  });

  it('termine une intervention commencée la veille : RG24 ne vaut que pour le démarrage', async () => {
    const { service, operations } = creerService({
      etat: verrouillee('EN_COURS'),
      dateTournee: '2026-12-05',
    });

    await service.terminer(42, {}, KEVIN);

    expect(operations.terminer).toHaveBeenCalledWith(42, {
      le: MAINTENANT,
      compteRendu: undefined,
    });
  });

  it('refuse en 400 de terminer une intervention planifiée, sans journaliser', async () => {
    const { service, journal } = creerService({ etat: verrouillee('PLANIFIEE') });

    await expect(service.terminer(42, {}, KEVIN)).rejects.toThrow(
      'Impossible de terminer une intervention planifiée.',
    );
    expect(journal.enregistrer).not.toHaveBeenCalled();
  });

  it('répond 403 au collègue qui veut terminer', async () => {
    const { service } = creerService({ etat: verrouillee('EN_COURS') });

    await expect(service.terminer(42, {}, MATHIEU)).rejects.toThrow(ForbiddenException);
  });
});

describe('InterventionsService : compte rendu (US18)', () => {
  it('enregistre le compte rendu d’une intervention terminée, sans journaliser', async () => {
    const { service, operations, journal } = creerService({ etat: verrouillee('TERMINEE') });

    await service.completerCompteRendu(42, { compteRendu: 'Siphon remplacé' }, KEVIN);

    expect(operations.enregistrerCompteRendu).toHaveBeenCalledWith(42, 'Siphon remplacé');
    expect(journal.enregistrer).not.toHaveBeenCalled();
  });

  it('refuse en 400 le compte rendu d’une intervention en cours', async () => {
    const { service, operations } = creerService({ etat: verrouillee('EN_COURS') });

    await expect(service.completerCompteRendu(42, { compteRendu: 'Texte' }, KEVIN)).rejects.toThrow(
      BadRequestException,
    );
    expect(operations.enregistrerCompteRendu).not.toHaveBeenCalled();
  });

  it('répond 403 au collègue', async () => {
    const { service } = creerService({ etat: verrouillee('TERMINEE') });

    await expect(
      service.completerCompteRendu(42, { compteRendu: 'Texte' }, MATHIEU),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('InterventionsService : signature du client (US33)', () => {
  const IMAGE = lireImagePng(enDataUrl(fabriquerPng()));
  const FIN_SIGNEE = {
    compteRendu: 'Joint du siphon remplacé',
    signature: { image: IMAGE, nomSignataire: 'Jean Dupont' },
  };
  const EMPREINTE = calculerEmpreinte({
    idIntervention: 42,
    compteRendu: 'Joint du siphon remplacé',
    nomSignataire: 'Jean Dupont',
    signeeLe: MAINTENANT,
    idAuteur: KEVIN.id,
    image: IMAGE,
  });

  describe('terminer avec une signature (RG30, RG34)', () => {
    it('enregistre la signature dans la transaction de la clôture, à la même heure', async () => {
      const { service, operations, evenements } = creerService({ etat: verrouillee('EN_COURS') });

      await service.terminer(42, FIN_SIGNEE, KEVIN);

      expect(operations.terminer).toHaveBeenCalledWith(42, {
        le: MAINTENANT,
        compteRendu: 'Joint du siphon remplacé',
      });
      expect(operations.enregistrerSignature).toHaveBeenCalledWith({
        idIntervention: 42,
        image: IMAGE,
        nomSignataire: 'Jean Dupont',
        signeeLe: MAINTENANT,
        empreinte: EMPREINTE,
        idAuteur: KEVIN.id,
      });
      expect(evenements).toEqual([
        'verrou intervention',
        'fin',
        'signature',
        'transaction validée',
        'journal',
        'journal',
      ]);
    });

    it('journalise SIGNATURE_ENREGISTREE après STATUT_MODIFIE, sans image ni nom', async () => {
      const { service, journal } = creerService({ etat: verrouillee('EN_COURS') });

      await service.terminer(42, FIN_SIGNEE, KEVIN);

      expect(journal.enregistrer).toHaveBeenCalledTimes(2);
      expect(journal.enregistrer).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: 'STATUT_MODIFIE', nouveauStatut: 'TERMINEE' }),
      );
      expect(journal.enregistrer).toHaveBeenNthCalledWith(2, {
        type: 'SIGNATURE_ENREGISTREE',
        auteur: { id: KEVIN.id, role: 'TECHNICIEN' },
        interventionId: 42,
        empreinte: EMPREINTE,
      });
      expect(JSON.stringify(journal.enregistrer.mock.calls)).not.toContain('Jean Dupont');
    });

    it('n’enregistre aucune signature et journalise seulement le statut sans signature', async () => {
      const { service, operations, journal } = creerService({ etat: verrouillee('EN_COURS') });

      await service.terminer(42, { compteRendu: 'Joint changé' }, KEVIN);

      expect(operations.enregistrerSignature).not.toHaveBeenCalled();
      expect(journal.enregistrer).toHaveBeenCalledTimes(1);
      expect(journal.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'STATUT_MODIFIE' }),
      );
    });

    it('ne journalise rien si la transaction échoue à la validation', async () => {
      const { service, journal } = creerService({
        etat: verrouillee('EN_COURS'),
        echecALaValidation: true,
      });

      await expect(service.terminer(42, FIN_SIGNEE, KEVIN)).rejects.toThrow(
        'Échec de la validation de la transaction',
      );
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });

    it.each<[StatutIntervention, string]>([
      ['PLANIFIEE', 'Impossible de terminer une intervention planifiée.'],
      ['A_PLANIFIER', 'Impossible de terminer une intervention à planifier.'],
      ['ANNULEE', 'Impossible de terminer une intervention annulée.'],
      ['TERMINEE', 'Impossible de terminer une intervention terminée.'],
    ])(
      'refuse en 400 une signature sur une intervention %s, sans rien écrire',
      async (statut, message) => {
        const { service, operations, journal } = creerService({ etat: verrouillee(statut) });

        await expect(service.terminer(42, FIN_SIGNEE, KEVIN)).rejects.toThrow(message);
        expect(operations.enregistrerSignature).not.toHaveBeenCalled();
        expect(journal.enregistrer).not.toHaveBeenCalled();
      },
    );

    it('répond 403 au collègue qui fait signer, sans rien écrire', async () => {
      const { service, operations, journal } = creerService({ etat: verrouillee('EN_COURS') });

      await expect(service.terminer(42, FIN_SIGNEE, MATHIEU)).rejects.toThrow(ForbiddenException);
      expect(operations.enregistrerSignature).not.toHaveBeenCalled();
      expect(journal.enregistrer).not.toHaveBeenCalled();
    });
  });

  describe('compte rendu d’une intervention signée (RG33)', () => {
    it('refuse en 400 de le modifier, sans rien écrire', async () => {
      const { service, operations } = creerService({ etat: verrouillee('TERMINEE'), signee: true });

      await expect(
        service.completerCompteRendu(42, { compteRendu: 'Autre texte' }, KEVIN),
      ).rejects.toThrow('Le compte rendu d’une intervention signée ne se modifie plus.');
      expect(operations.enregistrerCompteRendu).not.toHaveBeenCalled();
    });

    it('vérifie la signature sous le verrou de l’intervention, avant d’écrire', async () => {
      const { service, operations, evenements } = creerService({ etat: verrouillee('TERMINEE') });

      await service.completerCompteRendu(42, { compteRendu: 'Texte' }, KEVIN);

      expect(operations.estSignee).toHaveBeenCalledWith(42);
      expect(evenements).toEqual([
        'verrou intervention',
        'lecture de la signature',
        'compte rendu',
        'transaction validée',
      ]);
    });
  });

  describe('consulterSignature (RG34, RG35)', () => {
    const LUE: SignatureLue = {
      image: Uint8Array.from(IMAGE),
      nomSignataire: 'Jean Dupont',
      signeeLe: MAINTENANT,
      empreinte: EMPREINTE,
      auteur: { id: KEVIN.id, nom: 'Hoarau', prenom: 'Kévin' },
      compteRendu: 'Joint du siphon remplacé',
    };

    it('renvoie la signature intacte au gestionnaire, image en data URL', async () => {
      const { service } = creerService({
        intervention: interventionDetaillee('TERMINEE'),
        signatureLue: LUE,
      });

      const signature = await service.consulterSignature(42, GESTIONNAIRE);

      expect(signature).toEqual({
        nomSignataire: 'Jean Dupont',
        signeeLe: MAINTENANT,
        auteur: { id: KEVIN.id, nom: 'Hoarau', prenom: 'Kévin' },
        empreinte: EMPREINTE,
        integre: true,
        image: enDataUrl(IMAGE),
      });
    });

    it('la renvoie au technicien de la tournée', async () => {
      const { service } = creerService({
        intervention: interventionDetaillee('TERMINEE'),
        signatureLue: LUE,
      });

      await expect(service.consulterSignature(42, KEVIN)).resolves.toMatchObject({ integre: true });
    });

    it.each<[string, Partial<SignatureLue>]>([
      ['le compte rendu a changé', { compteRendu: 'Joint du siphon remplacé.' }],
      ['le compte rendu a été effacé', { compteRendu: null }],
      ['l’image a changé', { image: Uint8Array.from(fabriquerPng({ largeur: 601 })) }],
    ])('signale un contenu modifié quand %s', async (_cas, modification) => {
      const { service } = creerService({
        intervention: interventionDetaillee('TERMINEE'),
        signatureLue: { ...LUE, ...modification },
      });

      await expect(service.consulterSignature(42, GESTIONNAIRE)).resolves.toMatchObject({
        integre: false,
      });
    });

    it('répond 403 à un autre technicien, sans lire la signature', async () => {
      const { service, depot } = creerService({
        intervention: interventionDetaillee('TERMINEE'),
        signatureLue: LUE,
      });

      await expect(service.consulterSignature(42, MATHIEU)).rejects.toThrow(ForbiddenException);
      expect(depot.trouverSignature).not.toHaveBeenCalled();
    });

    it('répond 404 pour une intervention inexistante', async () => {
      const { service } = creerService({ intervention: null });

      await expect(service.consulterSignature(99, GESTIONNAIRE)).rejects.toThrow(
        new NotFoundException('Intervention introuvable.'),
      );
    });

    it('répond 404 pour une intervention qui n’a pas été signée', async () => {
      const { service } = creerService({ intervention: interventionDetaillee('TERMINEE') });

      await expect(service.consulterSignature(42, GESTIONNAIRE)).rejects.toThrow(
        new NotFoundException('Cette intervention n’a pas été signée.'),
      );
    });
  });
});
