import type { Adresse } from '../generated/prisma/client.ts';
import type { ClientAvecAdresses } from './clients.repository.js';
import { COLONNES_EXPORT_CLIENTS, versLignesCsvClients } from './export-clients.js';

// 22 h 30 UTC le 19 : déjà le 20 novembre à La Réunion (UTC+4).
const CREE_LE = new Date('2026-11-19T22:30:00Z');

function adresse(id: number, champs: Partial<Adresse> = {}): Adresse {
  return {
    id,
    rue: '12 rue des Manguiers',
    complement: null,
    codePostal: '97400',
    ville: 'Saint-Denis',
    infosAcces: null,
    archive: false,
    archiveLe: null,
    idClient: 8,
    ...champs,
  };
}

function client(champs: Partial<ClientAvecAdresses> = {}): ClientAvecAdresses {
  return {
    id: 8,
    typeClient: 'PARTICULIER',
    nomClient: 'Dupont',
    prenomClient: 'Marie',
    raisonSociale: null,
    telephone: '0692123456',
    emailClient: 'marie.dupont@exemple.re',
    archive: false,
    archiveLe: null,
    creeLe: CREE_LE,
    majLe: CREE_LE,
    adresses: [adresse(15, { infosAcces: 'Code 4521' })],
    ...champs,
  };
}

describe('versLignesCsvClients', () => {
  it('donne les colonnes du contrat, dans l’ordre, avec les noms reconnus par l’import', () => {
    expect(COLONNES_EXPORT_CLIENTS).toEqual([
      'id',
      'type_client',
      'nom',
      'prenom',
      'raison_sociale',
      'telephone',
      'email',
      'rue',
      'complement',
      'code_postal',
      'ville',
      'infos_acces',
      'archive',
      'cree_le',
    ]);
  });

  it('écrit un particulier : valeurs absentes à null, archive en non, jour de création à La Réunion', () => {
    const lignes = versLignesCsvClients([client()]);

    expect(lignes).toEqual([
      [
        8,
        'PARTICULIER',
        'Dupont',
        'Marie',
        null,
        '0692123456',
        'marie.dupont@exemple.re',
        '12 rue des Manguiers',
        null,
        '97400',
        'Saint-Denis',
        'Code 4521',
        'non',
        '2026-11-20',
      ],
    ]);
  });

  it('écrit une ligne par adresse, dans l’ordre reçu', () => {
    const deuxAdresses = client({
      adresses: [
        adresse(15),
        adresse(16, { rue: '8 avenue de la Victoire', complement: 'Local 2' }),
      ],
    });

    const lignes = versLignesCsvClients([deuxAdresses]);

    expect(lignes.map((ligne) => [ligne[0], ligne[7], ligne[8]])).toEqual([
      [8, '12 rue des Manguiers', null],
      [8, '8 avenue de la Victoire', 'Local 2'],
    ]);
  });

  it('écrit un client sans adresse active sur une ligne aux colonnes d’adresse vides', () => {
    const archive = client({ archive: true, archiveLe: CREE_LE, adresses: [] });

    const [ligne] = versLignesCsvClients([archive]);

    expect(ligne.slice(7, 12)).toEqual([null, null, null, null, null]);
    expect(ligne[12]).toBe('oui');
  });

  it('garde l’ordre des clients reçus', () => {
    const lignes = versLignesCsvClients([client({ id: 9 }), client({ id: 3 })]);

    expect(lignes.map((ligne) => ligne[0])).toEqual([9, 3]);
  });

  it('écrit l’identifiant en nombre (jamais neutralisé) et le téléphone en texte', () => {
    const [ligne] = versLignesCsvClients([client()]);

    expect(typeof ligne[0]).toBe('number');
    expect(ligne[5]).toBe('0692123456');
  });
});
