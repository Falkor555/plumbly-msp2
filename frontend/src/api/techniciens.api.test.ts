import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { enregistrerLesRequetes, parametresRecus } from '../test/msw/requetesRecues';
import { ErreurApi } from './erreurs';
import { techniciensApi } from './techniciens.api';
import type { FicheTechnicien, Indisponibilite, ListePaginee } from './types';

function fiche(id = 4): FicheTechnicien {
  return {
    id,
    utilisateurId: 9,
    nom: 'Grondin',
    prenom: 'Loïc',
    email: 'loic.grondin@plumbly.re',
    compteActif: true,
    telephone: '0692654321',
    couleurPlanning: '#0F766E',
    archive: false,
    archiveLe: null,
  };
}

function pageDe<T>(data: T[]): ListePaginee<T> {
  return { data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } };
}

const indisponibilite: Indisponibilite = {
  id: 11,
  debut: '2026-12-08T04:00:00.000Z',
  fin: '2026-12-08T14:00:00.000Z',
  motif: 'Formation',
};

describe('liste des techniciens', () => {
  it('US11 : envoie la recherche réduite, le tri, les archivés et la page', async () => {
    const recues = enregistrerLesRequetes('get', '/technicians', () =>
      HttpResponse.json(pageDe([fiche()])),
    );

    const page = await techniciensApi.lister({
      recherche: ' Loïc ',
      archives: true,
      tri: '-nom',
      page: 2,
      limit: 10,
    });

    expect(parametresRecus(recues[0])).toEqual({
      recherche: 'Loïc',
      archives: 'true',
      tri: '-nom',
      page: '2',
      limit: '10',
    });
    expect(page.data[0]?.email).toBe('loic.grondin@plumbly.re');
  });

  it('US11 : omet une recherche trop courte, les archivés non demandés, et plafonne limit à 100', async () => {
    const recues = enregistrerLesRequetes('get', '/technicians', () =>
      HttpResponse.json(pageDe([])),
    );

    await techniciensApi.lister({ recherche: 'L ', archives: false, limit: 101 });

    expect(parametresRecus(recues[0])).toEqual({ limit: '100' });
  });

  it('US11 : n’envoie pas typeClient, que l’API refuse sur cette route, même présent dans les filtres', async () => {
    const recues = enregistrerLesRequetes('get', '/technicians', () =>
      HttpResponse.json(pageDe([])),
    );
    // Un état de filtres partagé avec l'écran des clients, passé par une variable : le typage
    // structurel ne le refuse pas.
    const filtresPartages = { recherche: 'Loïc', typeClient: 'PARTICULIER' as const };

    await techniciensApi.lister(filtresPartages);

    expect(parametresRecus(recues[0])).toEqual({ recherche: 'Loïc' });
  });
});

describe('fiche d’un technicien', () => {
  it('US11 : crée la fiche avec l’identifiant du compte en nombre JSON', async () => {
    const recues = enregistrerLesRequetes('post', '/technicians', () =>
      HttpResponse.json(fiche(), { status: 201 }),
    );

    const creee = await techniciensApi.creer({ utilisateurId: 9, telephone: '0692654321' });

    const corps = JSON.parse(recues[0]?.corps ?? '') as Record<string, unknown>;
    expect(corps).toEqual({ utilisateurId: 9, telephone: '0692654321' });
    expect(typeof corps.utilisateurId).toBe('number');
    expect(creee.couleurPlanning).toBe('#0F766E');
  });

  it('US11 : remonte tel quel le refus d’un compte qui a déjà une fiche', async () => {
    enregistrerLesRequetes('post', '/technicians', () =>
      HttpResponse.json(
        { statusCode: 409, message: 'Ce compte a déjà une fiche technicien.', error: 'Conflict' },
        { status: 409 },
      ),
    );

    const erreur = await techniciensApi
      .creer({ utilisateurId: 9, telephone: '0692654321' })
      .catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ErreurApi);
    expect((erreur as ErreurApi).messagePourUtilisateur()).toBe(
      'Ce compte a déjà une fiche technicien.',
    );
  });

  it('US11 : lit une fiche par son identifiant', async () => {
    const recues = enregistrerLesRequetes('get', '/technicians/4', () =>
      HttpResponse.json(fiche()),
    );

    const lue = await techniciensApi.consulter(4);

    expect(recues).toHaveLength(1);
    expect(lue.utilisateurId).toBe(9);
  });

  it('US11 : modifie le téléphone et la couleur du planning', async () => {
    const recues = enregistrerLesRequetes('patch', '/technicians/4', () =>
      HttpResponse.json(fiche()),
    );

    await techniciensApi.modifier(4, { telephone: '0262 11 22 33', couleurPlanning: '#1e88e5' });

    expect(JSON.parse(recues[0]?.corps ?? '')).toEqual({
      telephone: '0262 11 22 33',
      couleurPlanning: '#1e88e5',
    });
  });

  it('US11 : archive le technicien par un POST sans corps', async () => {
    const recues = enregistrerLesRequetes('post', '/technicians/4/archive', () =>
      HttpResponse.json({ ...fiche(), archive: true, archiveLe: '2026-11-25T06:00:00.000Z' }),
    );

    const archivee = await techniciensApi.archiver(4);

    expect(recues[0]?.corps).toBe('');
    expect(archivee.archive).toBe(true);
  });
});

describe('indisponibilités d’un technicien', () => {
  it('US12 : demande les indisponibilités à venir sans paramètre par défaut', async () => {
    const recues = enregistrerLesRequetes('get', '/technicians/4/unavailabilities', () =>
      HttpResponse.json([indisponibilite]),
    );

    const liste = await techniciensApi.listerIndisponibilites(4);

    expect(recues[0]?.url.search).toBe('');
    expect(liste).toEqual([indisponibilite]);
  });

  it('US12 : envoie les bornes du et au d’une période', async () => {
    const recues = enregistrerLesRequetes('get', '/technicians/4/unavailabilities', () =>
      HttpResponse.json([]),
    );

    await techniciensApi.listerIndisponibilites(4, { du: '2026-12-01', au: '2026-12-31' });
    await techniciensApi.listerIndisponibilites(4, { au: '2026-11-30' });

    expect(parametresRecus(recues[0])).toEqual({ du: '2026-12-01', au: '2026-12-31' });
    expect(parametresRecus(recues[1])).toEqual({ au: '2026-11-30' });
  });

  it('US12 : ajoute une indisponibilité avec ses instants et son motif', async () => {
    const recues = enregistrerLesRequetes('post', '/technicians/4/unavailabilities', () =>
      HttpResponse.json(indisponibilite, { status: 201 }),
    );
    const nouvelle = {
      debut: '2026-12-08T04:00:00.000Z',
      fin: '2026-12-08T14:00:00.000Z',
      motif: 'Formation',
    };

    const ajoutee = await techniciensApi.ajouterIndisponibilite(4, nouvelle);

    expect(JSON.parse(recues[0]?.corps ?? '')).toEqual(nouvelle);
    expect(ajoutee.id).toBe(11);
  });

  it('US12 : remonte tel quel le conflit avec une intervention planifiée', async () => {
    const message =
      'La période recouvre une intervention planifiée ou en cours du technicien : n° 12 le 08/12/2026 de 08:00 à 09:00. Retirez-la de sa tournée ou déplacez-la d’abord.';
    enregistrerLesRequetes('post', '/technicians/4/unavailabilities', () =>
      HttpResponse.json({ statusCode: 409, message, error: 'Conflict' }, { status: 409 }),
    );

    const erreur = await techniciensApi
      .ajouterIndisponibilite(4, { debut: indisponibilite.debut, fin: indisponibilite.fin })
      .catch((e: unknown) => e);

    expect((erreur as ErreurApi).messagePourUtilisateur()).toBe(message);
  });

  it('US12 : supprime une indisponibilité et accepte la réponse 204 sans corps', async () => {
    const recues = enregistrerLesRequetes(
      'delete',
      '/technicians/4/unavailabilities/11',
      () => new HttpResponse(null, { status: 204 }),
    );

    const resultat = await techniciensApi.supprimerIndisponibilite(4, 11);

    expect(recues[0]?.methode).toBe('DELETE');
    expect(resultat).toBeUndefined();
  });
});
