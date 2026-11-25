import { describe, expect, it } from 'vitest';
import { fabriquerAdresse, fabriquerClient } from '../test/clientsDeTest';
import {
  adresseSurUneLigne,
  identiteDuClient,
  nombreDeClients,
  separerAdresses,
  telephoneLisible,
  villePrincipale,
} from './presentation';

describe('présentation des clients', () => {
  it.each([
    [0, '0 client'],
    [1, '1 client'],
    [2, '2 clients'],
    [134, '134 clients'],
  ])('US08 : compte %d client(s) en « %s »', (nombre, attendu) => {
    expect(nombreDeClients(nombre)).toBe(attendu);
  });

  it('US08 : prend la ville de la première adresse en service', () => {
    const client = fabriquerClient({
      id: 1,
      nomAffiche: 'Hélène Payet',
      adresses: [
        fabriquerAdresse({ id: 1, ville: 'Le Port', archive: true }),
        fabriquerAdresse({ id: 2, ville: 'Saint-Denis' }),
        fabriquerAdresse({ id: 3, ville: 'Saint-Paul' }),
      ],
    });

    expect(villePrincipale(client)).toBe('Saint-Denis');
  });

  it('US08 : n’invente pas de ville sans adresse en service', () => {
    expect(villePrincipale({ adresses: [] })).toBeNull();
    expect(villePrincipale({ adresses: [fabriquerAdresse({ id: 1, archive: true })] })).toBeNull();
  });

  it.each([
    ['0692123456', '0692 12 34 56'],
    ['0262414243', '0262 41 42 43'],
    ['069212345', '069212345'],
    ['+262692123456', '+262692123456'],
    ['', ''],
  ])('US08 : écrit le téléphone %s sous la forme « %s »', (telephone, attendu) => {
    expect(telephoneLisible(telephone)).toBe(attendu);
  });

  it('US09 : sépare les adresses en service des archivées, dans l’ordre reçu', () => {
    const adresses = [
      fabriquerAdresse({ id: 1 }),
      fabriquerAdresse({ id: 2, archive: true }),
      fabriquerAdresse({ id: 3 }),
    ];

    const { enService, archivees } = separerAdresses(adresses);

    expect(enService.map(({ id }) => id)).toEqual([1, 3]);
    expect(archivees.map(({ id }) => id)).toEqual([2]);
  });

  it('US09 : écrit une adresse sur une ligne, sans complément', () => {
    expect(
      adresseSurUneLigne(
        fabriquerAdresse({
          id: 1,
          rue: '12 rue des Lilas',
          complement: 'Bât. B',
          ville: 'Saint-Denis',
        }),
      ),
    ).toBe('12 rue des Lilas, 97400 Saint-Denis');
  });

  it('US09 : présente le nom et le prénom d’un particulier, même absents', () => {
    expect(
      identiteDuClient({
        typeClient: 'PARTICULIER',
        nomClient: 'Payet',
        prenomClient: null,
        raisonSociale: null,
      }),
    ).toEqual([
      { titre: 'Nom', valeur: 'Payet' },
      { titre: 'Prénom', valeur: null },
    ]);
  });

  it('US09 : présente la raison sociale d’un professionnel et sa personne à contacter', () => {
    const professionnel = {
      typeClient: 'PROFESSIONNEL' as const,
      nomClient: 'Técher',
      prenomClient: 'Marie',
      raisonSociale: 'Boulangerie Técher',
    };

    expect(identiteDuClient(professionnel)).toEqual([
      { titre: 'Raison sociale', valeur: 'Boulangerie Técher' },
      { titre: 'Contact', valeur: 'Marie Técher' },
    ]);
    expect(identiteDuClient({ ...professionnel, nomClient: null, prenomClient: null })[1]).toEqual({
      titre: 'Contact',
      valeur: null,
    });
  });
});
