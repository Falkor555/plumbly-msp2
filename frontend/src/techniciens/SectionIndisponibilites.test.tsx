import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { effacerJetonAcces } from '../api/jetonAcces';
import type { FicheTechnicien, Indisponibilite } from '../api/types';
import {
  enregistrerLesRequetes,
  parametresRecus,
  type RequeteRecue,
} from '../test/msw/requetesRecues';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { afficherAvecSession, GESTIONNAIRE_DE_TEST } from '../test/session';
import { karimDeTest } from '../test/techniciensDeTest';
import { PageFicheTechnicien } from './PageFicheTechnicien';

const CHEMIN_LISTE = '/technicians/2/unavailabilities';

/** Les tests se passent le 26 novembre 2026 à 10:00, heure de La Réunion. */
const MAINTENANT = new Date('2026-11-26T06:00:00.000Z');

const MESSAGE_INTERVENTION_RECOUVERTE =
  'La période recouvre une intervention planifiée ou en cours du technicien : n° 42 le 27/11/2026 de 08:00 à 09:00. Retirez-la de sa tournée ou déplacez-la d’abord.';
const MESSAGE_INDISPONIBILITE_RECOUVERTE =
  'La période recouvre une autre indisponibilité du technicien : du 27/11/2026 08:00 au 27/11/2026 12:00.';
const MESSAGE_TERMINEE =
  'Cette indisponibilité est terminée : elle est conservée dans l’historique.';

afterEach(() => effacerJetonAcces());

/** Le 27 novembre 2026 de 08:00 à 12:00, heure de La Réunion, pour une formation. */
function formation(): Indisponibilite {
  return {
    id: 11,
    debut: '2026-11-27T04:00:00.000Z',
    fin: '2026-11-27T08:00:00.000Z',
    motif: 'Formation',
  };
}

/** Du 7 décembre 2026 à 00:00 au 12 décembre 2026 à 00:00, sans motif. */
function conges(): Indisponibilite {
  return {
    id: 12,
    debut: '2026-12-06T20:00:00.000Z',
    fin: '2026-12-11T20:00:00.000Z',
    motif: null,
  };
}

interface FicheOuverte {
  /** Lectures de la liste, dans l'ordre, pour en compter les relectures et lire leurs paramètres. */
  lectures: RequeteRecue[];
  /** La liste que renverront les lectures suivantes, après une écriture simulée. */
  remplacer: (liste: Indisponibilite[]) => void;
}

interface OptionsOuverture {
  technicien?: FicheTechnicien;
  indisponibilites?: Indisponibilite[];
  maintenant?: Date;
}

/** Ouvre la fiche du technicien 2 avec ses indisponibilités et attend la liste. */
async function ouvrirLaFiche({
  technicien = karimDeTest(),
  indisponibilites = [formation()],
  maintenant = MAINTENANT,
}: OptionsOuverture = {}): Promise<FicheOuverte> {
  let courante = indisponibilites;
  serveurApi.use(http.get(urlApi('/technicians/2'), () => HttpResponse.json(technicien)));
  const lectures = enregistrerLesRequetes('get', CHEMIN_LISTE, () => HttpResponse.json(courante));
  await afficherAvecSession(
    <PageFicheTechnicien maintenant={() => maintenant} />,
    GESTIONNAIRE_DE_TEST,
    '/techniciens/2',
    '/techniciens/:id',
  );
  await screen.findByRole('region', { name: 'Indisponibilités' });
  await waitFor(() => expect(lectures).toHaveLength(1));
  await waitFor(() =>
    expect(within(section()).queryByText('Chargement des indisponibilités…')).toBeNull(),
  );
  return {
    lectures,
    remplacer: (liste) => {
      courante = liste;
    },
  };
}

function section(): HTMLElement {
  return screen.getByRole('region', { name: 'Indisponibilités' });
}

/** Région live des messages de succès de la fiche. */
function zoneDAnnonce(): HTMLElement {
  return screen.getByRole('status', { name: 'Confirmation' });
}

/** Lignes du tableau, sans celle des en-têtes. */
function lignes(): HTMLElement[] {
  return within(within(section()).getByRole('table')).getAllByRole('row').slice(1);
}

function champPeriode(nom: 'Du' | 'Au'): HTMLElement {
  return within(section()).getByLabelText(nom);
}

function boutonDAjout(): HTMLElement {
  return screen.getByRole('button', { name: 'Ajouter une indisponibilité' });
}

function boutonSupprimer(debut: string): HTMLElement {
  return within(section()).getByRole('button', { name: `Supprimer l’indisponibilité du ${debut}` });
}

/** Une réponse que le test libère quand il le décide, pour observer l'écran pendant l'attente. */
function reponseRetenue(): { attendre: Promise<void>; liberer: () => void } {
  let liberer: () => void = () => undefined;
  const attendre = new Promise<void>((resoudre) => (liberer = resoudre));
  return { attendre, liberer };
}

async function ouvrirLAjout(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.click(boutonDAjout());
  return screen.getByRole('dialog', { name: 'Ajouter une indisponibilité' });
}

/** Saisit le 27/11/2026 de 08:00 à 12:00, heure de La Réunion. */
async function saisirLaFormation(
  utilisateur: ReturnType<typeof userEvent.setup>,
  fenetre: HTMLElement,
  motif = '',
) {
  await utilisateur.type(
    within(fenetre).getByLabelText('Date de début (obligatoire)'),
    '2026-11-27',
  );
  await utilisateur.type(within(fenetre).getByLabelText('Heure de début (obligatoire)'), '08:00');
  await utilisateur.type(within(fenetre).getByLabelText('Date de fin (obligatoire)'), '2026-11-27');
  await utilisateur.type(within(fenetre).getByLabelText('Heure de fin (obligatoire)'), '12:00');
  if (motif) await utilisateur.type(within(fenetre).getByLabelText('Motif'), motif);
}

function boutonDEnvoi(fenetre: HTMLElement): HTMLElement {
  return within(fenetre).getByRole('button', { name: 'Ajouter l’indisponibilité' });
}

function refuser(statut: 400 | 409, message: string | string[]) {
  serveurApi.use(
    http.post(urlApi(CHEMIN_LISTE), () =>
      HttpResponse.json({ statusCode: statut, message, error: 'Refus' }, { status: statut }),
    ),
  );
}

describe('liste des indisponibilités (US12)', () => {
  it('US12 : lit par défaut la liste sans du ni au et affiche début, fin et motif à l’heure de La Réunion', async () => {
    const { lectures } = await ouvrirLaFiche({ indisponibilites: [formation(), conges()] });

    expect(parametresRecus(lectures[0])).toEqual({});
    const tableau = within(section()).getByRole('table', {
      name: 'Indisponibilités de Karim Benali, par date de début',
    });
    expect(
      within(tableau)
        .getAllByRole('columnheader')
        .map((entete) => entete.textContent),
    ).toEqual(['Début', 'Fin', 'Motif', 'Action']);
    const [premiere, seconde] = lignes();
    expect(
      within(premiere)
        .getAllByRole('cell')
        .map((cellule) => cellule.textContent),
    ).toEqual([
      '27/11/2026 08:00',
      '27/11/2026 12:00',
      'Formation',
      'Supprimer l’indisponibilité du 27/11/2026 08:00',
    ]);
    expect(
      within(seconde)
        .getAllByRole('cell')
        .map((cellule) => cellule.textContent),
    ).toEqual([
      '07/12/2026 00:00',
      '12/12/2026 00:00',
      '—',
      'Supprimer l’indisponibilité du 07/12/2026 00:00',
    ]);
    expect(screen.getByRole('status', { name: 'Nombre d’indisponibilités' })).toHaveTextContent(
      '2 indisponibilités',
    );
  });

  it('US12 : une liste vide le dit clairement, sans tableau', async () => {
    await ouvrirLaFiche({ indisponibilites: [] });

    expect(
      within(section()).getByText('Aucune indisponibilité en cours ou à venir.', {
        ignore: '.sr-only',
      }),
    ).toBeInTheDocument();
    expect(within(section()).queryByRole('table')).toBeNull();
  });

  it('US12 : la période envoie du et au en AAAA-MM-JJ, une borne seule part seule, et le retour aux « à venir » relit sans paramètre en gardant le focus', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFiche();
    remplacer([]);
    // Borné à quatre chiffres d'année : au-delà, ni la validation ni l'API ne reconnaissent la date.
    expect(champPeriode('Du')).toHaveAttribute('max', '9999-12-31');
    expect(champPeriode('Au')).toHaveAttribute('max', '9999-12-31');

    await utilisateur.type(champPeriode('Du'), '2026-12-01');
    await waitFor(() => expect(lectures).toHaveLength(2));
    expect(parametresRecus(lectures[1])).toEqual({ du: '2026-12-01' });

    await utilisateur.type(champPeriode('Au'), '2026-12-31');
    await waitFor(() => expect(lectures).toHaveLength(3));
    expect(parametresRecus(lectures[2])).toEqual({ du: '2026-12-01', au: '2026-12-31' });
    expect(
      await within(section()).findByText('Aucune indisponibilité sur cette période.', {
        ignore: '.sr-only',
      }),
    ).toBeInTheDocument();

    await utilisateur.click(
      within(section()).getByRole('button', { name: 'Revenir aux indisponibilités à venir' }),
    );

    await waitFor(() => expect(lectures).toHaveLength(4));
    expect(parametresRecus(lectures[3])).toEqual({});
    expect(champPeriode('Du')).toHaveValue('');
    expect(champPeriode('Au')).toHaveValue('');
    expect(
      within(section()).queryByRole('button', { name: 'Revenir aux indisponibilités à venir' }),
    ).toBeNull();
    // Le bouton cliqué a disparu : le focus est passé sur le champ « Du », pas sur le document.
    expect(champPeriode('Du')).toHaveFocus();
  });

  it('US12 : la borne « au » seule part seule', async () => {
    const utilisateur = userEvent.setup();
    const { lectures } = await ouvrirLaFiche();

    await utilisateur.type(champPeriode('Au'), '2026-12-31');

    await waitFor(() => expect(lectures).toHaveLength(2));
    expect(parametresRecus(lectures[1])).toEqual({ au: '2026-12-31' });
  });

  it('US12 : des valeurs intermédiaires tapées à la suite ne donnent qu’une lecture, avec les bornes finales', async () => {
    const { lectures, remplacer } = await ouvrirLaFiche();
    remplacer([]);

    // Ce qu'un navigateur émet pendant la frappe de l'année dans un champ date.
    for (const du of ['0002-12-01', '0020-12-01', '0202-12-01', '2026-12-01']) {
      fireEvent.change(champPeriode('Du'), { target: { value: du } });
    }
    fireEvent.change(champPeriode('Au'), { target: { value: '2026-12-31' } });

    expect(
      await within(section()).findByText('Aucune indisponibilité sur cette période.', {
        ignore: '.sr-only',
      }),
    ).toBeInTheDocument();
    expect(lectures).toHaveLength(2);
    expect(parametresRecus(lectures[1])).toEqual({ du: '2026-12-01', au: '2026-12-31' });
    expect(within(section()).queryByRole('alert')).toBeNull();
  });

  it('US12 : un début après la fin affiche le message de l’API sur les deux champs une fois la saisie posée, sans appel', async () => {
    const utilisateur = userEvent.setup();
    const { lectures } = await ouvrirLaFiche();
    await utilisateur.type(champPeriode('Au'), '2026-11-30');
    await waitFor(() => expect(lectures).toHaveLength(2));

    await utilisateur.type(champPeriode('Du'), '2026-12-01');

    const alerte = await within(section()).findByRole('alert');
    expect(alerte).toHaveTextContent('du doit précéder au');
    expect(champPeriode('Du')).toHaveAttribute('aria-invalid', 'true');
    expect(champPeriode('Au')).toHaveAttribute('aria-invalid', 'true');
    expect(champPeriode('Du')).toHaveAccessibleDescription(/du doit précéder au$/);
    expect(champPeriode('Au')).toHaveAccessibleDescription(/du doit précéder au$/);
    expect(lectures).toHaveLength(2);
    // La liste précédente reste affichée pendant la correction.
    expect(lignes()).toHaveLength(1);
  });

  it('US12 : un échec de lecture affiche l’alerte, et « Réessayer » relit la liste', async () => {
    const utilisateur = userEvent.setup();
    serveurApi.use(http.get(urlApi('/technicians/2'), () => HttpResponse.json(karimDeTest())));
    serveurApi.use(
      http.get(urlApi(CHEMIN_LISTE), () => HttpResponse.json([formation()]), { once: true }),
    );
    serveurApi.use(
      http.get(
        urlApi(CHEMIN_LISTE),
        () => HttpResponse.json({ statusCode: 500, message: 'détail interne' }, { status: 500 }),
        { once: true },
      ),
    );
    await afficherAvecSession(
      <PageFicheTechnicien maintenant={() => MAINTENANT} />,
      GESTIONNAIRE_DE_TEST,
      '/techniciens/2',
      '/techniciens/:id',
    );
    await screen.findByRole('region', { name: 'Indisponibilités' });

    const alerte = await within(section()).findByRole('alert');

    expect(alerte).toHaveTextContent('Une erreur est survenue. Réessayez plus tard.');
    expect(alerte).not.toHaveTextContent('détail interne');

    await utilisateur.click(within(alerte).getByRole('button', { name: 'Réessayer' }));

    expect(await within(section()).findByText('Formation')).toBeInTheDocument();
  });
});

describe('ajout d’une indisponibilité (US12, RG10)', () => {
  it('US12 : envoie début et fin en UTC avec fuseau, sans motif quand il est vide, puis ferme, relit la liste et l’annonce', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFiche({ indisponibilites: [] });
    const ajouts = enregistrerLesRequetes('post', CHEMIN_LISTE, () => {
      remplacer([formation()]);
      return HttpResponse.json({ ...formation(), motif: null }, { status: 201 });
    });
    const fenetre = await ouvrirLAjout(utilisateur);
    expect(within(fenetre).getByLabelText('Date de début (obligatoire)')).toHaveFocus();
    expect(within(fenetre).getByLabelText('Date de début (obligatoire)')).toHaveAttribute(
      'type',
      'date',
    );
    expect(within(fenetre).getByLabelText('Date de début (obligatoire)')).toHaveAttribute(
      'max',
      '9999-12-31',
    );
    expect(within(fenetre).getByLabelText('Heure de début (obligatoire)')).toHaveAttribute(
      'type',
      'time',
    );
    expect(within(fenetre).getByLabelText('Motif')).toHaveAttribute('maxlength', '255');
    await saisirLaFormation(utilisateur, fenetre);

    await utilisateur.click(boutonDEnvoi(fenetre));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(ajouts).toHaveLength(1);
    expect(JSON.parse(ajouts[0].corps)).toEqual({
      debut: '2026-11-27T04:00:00.000Z',
      fin: '2026-11-27T08:00:00.000Z',
    });
    expect(await within(section()).findByText('Formation')).toBeInTheDocument();
    expect(lectures).toHaveLength(2);
    expect(zoneDAnnonce()).toHaveTextContent('Indisponibilité ajoutée.');
    expect(boutonDAjout()).toHaveFocus();
  });

  it('US12 : envoie le motif quand il est saisi', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFiche();
    const ajouts = enregistrerLesRequetes('post', CHEMIN_LISTE, () =>
      HttpResponse.json(formation(), { status: 201 }),
    );
    const fenetre = await ouvrirLAjout(utilisateur);
    await saisirLaFormation(utilisateur, fenetre, 'Formation');

    await utilisateur.click(boutonDEnvoi(fenetre));

    await waitFor(() => expect(ajouts).toHaveLength(1));
    expect(JSON.parse(ajouts[0].corps)).toEqual({
      debut: '2026-11-27T04:00:00.000Z',
      fin: '2026-11-27T08:00:00.000Z',
      motif: 'Formation',
    });
  });

  it('US12 : un motif plus long que la limite de l’API est tronqué à la saisie et part tronqué', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFiche();
    const ajouts = enregistrerLesRequetes('post', CHEMIN_LISTE, () =>
      HttpResponse.json(formation(), { status: 201 }),
    );
    const fenetre = await ouvrirLAjout(utilisateur);
    await saisirLaFormation(utilisateur, fenetre);
    const motif = within(fenetre).getByLabelText('Motif');

    await utilisateur.click(motif);
    await utilisateur.paste('m'.repeat(256));

    expect(motif).toHaveValue('m'.repeat(255));

    await utilisateur.click(boutonDEnvoi(fenetre));

    await waitFor(() => expect(ajouts).toHaveLength(1));
    expect(JSON.parse(ajouts[0].corps).motif).toBe('m'.repeat(255));
  });

  it('US12 : « Annuler » puis Échap ferment la fenêtre sans appel et rendent le focus au bouton d’ajout', async () => {
    const utilisateur = userEvent.setup();
    // Aucun POST simulé : un envoi ferait échouer le test (requête non simulée).
    const { lectures } = await ouvrirLaFiche();
    const fenetre = await ouvrirLAjout(utilisateur);
    await saisirLaFormation(utilisateur, fenetre, 'Formation');

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boutonDAjout()).toHaveFocus();

    await ouvrirLAjout(utilisateur);
    await utilisateur.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boutonDAjout()).toHaveFocus();
    expect(lectures).toHaveLength(1);
    expect(zoneDAnnonce()).toBeEmptyDOMElement();
  });

  it('US12 : les quatre champs vides sont signalés chacun sous leur champ, le premier reçoit le focus, sans appel', async () => {
    const utilisateur = userEvent.setup();
    // Aucun POST simulé : un envoi ferait échouer le test (requête non simulée).
    await ouvrirLaFiche();
    const fenetre = await ouvrirLAjout(utilisateur);

    await utilisateur.click(boutonDEnvoi(fenetre));

    const dateDebut = within(fenetre).getByLabelText('Date de début (obligatoire)');
    expect(dateDebut).toHaveAttribute('aria-invalid', 'true');
    expect(dateDebut).toHaveAccessibleDescription('Saisissez la date de début.');
    expect(
      within(fenetre).getByLabelText('Heure de début (obligatoire)'),
    ).toHaveAccessibleDescription('Heure de La Réunion. Saisissez l’heure de début.');
    expect(within(fenetre).getByLabelText('Date de fin (obligatoire)')).toHaveAccessibleDescription(
      'Saisissez la date de fin.',
    );
    expect(
      within(fenetre).getByLabelText('Heure de fin (obligatoire)'),
    ).toHaveAccessibleDescription('Heure de La Réunion. Saisissez l’heure de fin.');
    expect(within(fenetre).getByRole('alert')).toHaveTextContent(
      '4 champs sont à corriger : chaque message est affiché sous son champ.',
    );
    await waitFor(() => expect(dateDebut).toHaveFocus());
  });

  it('US12 : une fin antérieure au début est signalée sur l’heure de fin, sans appel', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFiche();
    const fenetre = await ouvrirLAjout(utilisateur);
    await saisirLaFormation(utilisateur, fenetre);
    const heureFin = within(fenetre).getByLabelText('Heure de fin (obligatoire)');
    await utilisateur.clear(heureFin);
    await utilisateur.type(heureFin, '07:00');

    await utilisateur.click(boutonDEnvoi(fenetre));

    expect(heureFin).toHaveAttribute('aria-invalid', 'true');
    expect(heureFin).toHaveAccessibleDescription(
      'Heure de La Réunion. La fin doit être postérieure au début.',
    );
    await waitFor(() => expect(heureFin).toHaveFocus());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('US12 : un refus 400 de l’API (tableau) s’affiche tel quel, ligne par ligne', async () => {
    const utilisateur = userEvent.setup();
    const messages = [
      'debut doit être une date-heure ISO 8601 avec fuseau, par exemple 2026-12-08T08:00:00+04:00',
      'fin doit être postérieure à debut',
    ];
    const { lectures } = await ouvrirLaFiche();
    refuser(400, messages);
    const fenetre = await ouvrirLAjout(utilisateur);
    await saisirLaFormation(utilisateur, fenetre);

    await utilisateur.click(boutonDEnvoi(fenetre));

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe(messages.join('\n'));
    expect(lectures).toHaveLength(1);
  });

  it.each([
    ['une intervention', MESSAGE_INTERVENTION_RECOUVERTE],
    ['une autre indisponibilité', MESSAGE_INDISPONIBILITE_RECOUVERTE],
  ])(
    'RG10 : le 409 qui cite %s s’affiche tel quel, la fenêtre reste ouverte et le focus revient sur le bouton d’envoi',
    async (_, message) => {
      const utilisateur = userEvent.setup();
      const { lectures } = await ouvrirLaFiche();
      refuser(409, message);
      const fenetre = await ouvrirLAjout(utilisateur);
      await saisirLaFormation(utilisateur, fenetre);

      await utilisateur.click(boutonDEnvoi(fenetre));

      const alerte = await within(fenetre).findByRole('alert');
      expect(alerte.textContent).toBe(message);
      expect(
        screen.getByRole('dialog', { name: 'Ajouter une indisponibilité' }),
      ).toBeInTheDocument();
      expect(boutonDEnvoi(fenetre)).toHaveFocus();
      expect(lectures).toHaveLength(1);
      expect(zoneDAnnonce()).toBeEmptyDOMElement();
    },
  );
});

describe('suppression d’une indisponibilité (US12)', () => {
  const CHEMIN_FORMATION = `${CHEMIN_LISTE}/11`;

  it('US12 : demande confirmation en citant la période et le motif ; « Annuler » n’appelle rien', async () => {
    const utilisateur = userEvent.setup();
    const { lectures } = await ouvrirLaFiche();
    const suppressions = enregistrerLesRequetes(
      'delete',
      CHEMIN_FORMATION,
      () => new HttpResponse(null, { status: 204 }),
    );
    const supprimer = boutonSupprimer('27/11/2026 08:00');

    await utilisateur.click(supprimer);

    const fenetre = screen.getByRole('dialog', { name: 'Supprimer l’indisponibilité ?' });
    expect(fenetre).toHaveAccessibleDescription(
      /Indisponibilité de Karim Benali du 27\/11\/2026 08:00 au 27\/11\/2026 12:00 \(Formation\)\./,
    );
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toHaveFocus();

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(supprimer).toHaveFocus();
    expect(suppressions).toHaveLength(0);
    expect(lectures).toHaveLength(1);
  });

  it('US12 : la confirmation d’une indisponibilité sans motif le dit', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFiche({ indisponibilites: [conges()] });

    await utilisateur.click(boutonSupprimer('07/12/2026 00:00'));

    expect(
      screen.getByRole('dialog', { name: 'Supprimer l’indisponibilité ?' }),
    ).toHaveAccessibleDescription(
      /Indisponibilité de Karim Benali du 07\/12\/2026 00:00 au 12\/12\/2026 00:00, sans motif\./,
    );
  });

  it('US12 : « Supprimer » appelle DELETE, relit la liste, l’annonce et pose le focus sur le titre de la section', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFiche({
      indisponibilites: [formation(), conges()],
    });
    const suppressions = enregistrerLesRequetes('delete', CHEMIN_FORMATION, () => {
      remplacer([conges()]);
      return new HttpResponse(null, { status: 204 });
    });
    await utilisateur.click(boutonSupprimer('27/11/2026 08:00'));
    const fenetre = screen.getByRole('dialog', { name: 'Supprimer l’indisponibilité ?' });

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(within(section()).queryByText('Formation')).toBeNull());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(suppressions).toHaveLength(1);
    expect(suppressions[0].corps).toBe('');
    expect(lectures).toHaveLength(2);
    expect(lignes()).toHaveLength(1);
    expect(zoneDAnnonce()).toHaveTextContent('Indisponibilité supprimée.');
    expect(screen.getByRole('heading', { level: 2, name: 'Indisponibilités' })).toHaveFocus();
  });

  it('US12 : pendant la relecture qui suit une suppression, les boutons de la liste sont inactifs et n’ouvrent rien', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFiche({ indisponibilites: [formation(), conges()] });
    const { attendre, liberer } = reponseRetenue();
    serveurApi.use(
      http.get(urlApi(CHEMIN_LISTE), async () => {
        await attendre;
        return HttpResponse.json([conges()]);
      }),
    );
    serveurApi.use(
      http.delete(urlApi(CHEMIN_FORMATION), () => new HttpResponse(null, { status: 204 })),
    );
    await utilisateur.click(boutonSupprimer('27/11/2026 08:00'));
    const fenetre = screen.getByRole('dialog', { name: 'Supprimer l’indisponibilité ?' });

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Supprimer' }));

    // La relecture part dans un effet, juste après la fermeture : la réponse retenue la fige ensuite.
    await waitFor(() =>
      expect(within(section()).getByRole('table')).toHaveAttribute('aria-busy', 'true'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Les lignes affichées sont périmées jusqu'à la réponse : rien ne doit partir sur elles.
    expect(boutonSupprimer('07/12/2026 00:00')).toHaveAttribute('aria-disabled', 'true');
    expect(boutonDAjout()).toHaveAttribute('aria-disabled', 'true');

    await utilisateur.click(boutonSupprimer('07/12/2026 00:00'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    liberer();

    await waitFor(() => expect(within(section()).queryByText('Formation')).toBeNull());
    expect(boutonSupprimer('07/12/2026 00:00')).not.toHaveAttribute('aria-disabled');
    expect(boutonDAjout()).not.toHaveAttribute('aria-disabled');
  });

  it('US12 : le refus 400 d’une indisponibilité terminée s’affiche tel quel dans la confirmation', async () => {
    const utilisateur = userEvent.setup();
    const { lectures } = await ouvrirLaFiche();
    serveurApi.use(
      http.delete(urlApi(CHEMIN_FORMATION), () =>
        HttpResponse.json(
          { statusCode: 400, message: MESSAGE_TERMINEE, error: 'Bad Request' },
          { status: 400 },
        ),
      ),
    );
    await utilisateur.click(boutonSupprimer('27/11/2026 08:00'));
    const fenetre = screen.getByRole('dialog', { name: 'Supprimer l’indisponibilité ?' });

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Supprimer' }));

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe(MESSAGE_TERMINEE);
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    expect(lectures).toHaveLength(1);
    expect(zoneDAnnonce()).toBeEmptyDOMElement();
  });

  it('US12 : une indisponibilité terminée n’a pas de bouton « Supprimer », une en cours le garde', async () => {
    // À 10:00 le 27 novembre, la formation (08:00-12:00) est en cours ; celle des 20-21 est passée.
    await ouvrirLaFiche({
      indisponibilites: [
        { id: 9, debut: '2026-11-20T04:00:00.000Z', fin: '2026-11-21T04:00:00.000Z', motif: null },
        formation(),
      ],
      maintenant: new Date('2026-11-27T06:00:00.000Z'),
    });

    const [passee, enCours] = lignes();
    expect(within(passee).queryByRole('button')).toBeNull();
    expect(
      within(enCours).getByRole('button', {
        name: 'Supprimer l’indisponibilité du 27/11/2026 08:00',
      }),
    ).toBeInTheDocument();
  });

  it('RG22 : un technicien archivé garde sa liste, sans ajout ni suppression', async () => {
    await ouvrirLaFiche({
      technicien: { ...karimDeTest(), archive: true, archiveLe: '2026-11-25T06:00:00.000Z' },
    });

    expect(within(section()).getByText('Formation')).toBeInTheDocument();
    // Lecture seule côté écran, même si l'API accepte encore la suppression sur une fiche archivée.
    expect(screen.queryByRole('button', { name: 'Ajouter une indisponibilité' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).toBeNull();
  });
});
