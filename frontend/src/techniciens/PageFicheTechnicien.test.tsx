import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { effacerJetonAcces } from '../api/jetonAcces';
import type { FicheTechnicien } from '../api/types';
import { enregistrerLesRequetes, type RequeteRecue } from '../test/msw/requetesRecues';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { afficherAvecSession, GESTIONNAIRE_DE_TEST } from '../test/session';
import { karimDeTest } from '../test/techniciensDeTest';
import { PageFicheTechnicien } from './PageFicheTechnicien';

const MESSAGE_INTERVENTIONS_A_VENIR =
  'Impossible d’archiver ce technicien tant qu’il a des interventions en cours ou planifiées à partir d’aujourd’hui (2 actuellement) : retirez-les de ses tournées d’abord.';

afterEach(() => effacerJetonAcces());

interface FicheOuverte {
  lectures: RequeteRecue[];
  /** La fiche que renverront les lectures suivantes, après une écriture simulée. */
  remplacer: (technicien: FicheTechnicien) => void;
}

/** La section des indisponibilités lit sa liste avec la fiche : vide ici, elle a ses propres tests. */
function servirAucuneIndisponibilite(): void {
  serveurApi.use(http.get(urlApi('/technicians/2/unavailabilities'), () => HttpResponse.json([])));
}

/** Ouvre la fiche du technicien 2 ; chaque lecture est gardée, pour compter la relecture. */
async function ouvrirLaFiche(depart: FicheTechnicien = karimDeTest()): Promise<FicheOuverte> {
  let courante = depart;
  servirAucuneIndisponibilite();
  const lectures = enregistrerLesRequetes('get', '/technicians/2', () =>
    HttpResponse.json(courante),
  );
  afficherAvecSession(
    <PageFicheTechnicien />,
    GESTIONNAIRE_DE_TEST,
    '/techniciens/2',
    '/techniciens/:id',
  );
  await screen.findByRole('heading', { level: 1, name: `${depart.prenom} ${depart.nom}` });
  return {
    lectures,
    remplacer: (technicien) => {
      courante = technicien;
    },
  };
}

function coordonnees(): HTMLElement {
  return screen.getByRole('region', { name: 'Coordonnées' });
}

function rubrique(titre: string): HTMLElement {
  return within(coordonnees()).getByText(titre).nextSibling as HTMLElement;
}

function bouton(nom: string): HTMLElement {
  return screen.getByRole('button', { name: nom });
}

/** Région live des messages de succès, présente (vide) dès l'affichage de la fiche. */
function zoneDAnnonce(): HTMLElement {
  return screen.getByRole('status', { name: 'Confirmation' });
}

async function ouvrirLaModification(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.click(bouton('Modifier le téléphone et la couleur'));
  return screen.getByRole('dialog', { name: 'Modifier le téléphone et la couleur' });
}

function karimArchive(): FicheTechnicien {
  return { ...karimDeTest(), archive: true, archiveLe: '2026-11-25T06:00:00.000Z' };
}

describe('fiche technicien (US11)', () => {
  it('US11 : affiche le nom en titre ; nom, prénom et e-mail du compte sont en lecture seule, avec la mention de l’administrateur', async () => {
    await ouvrirLaFiche();

    expect(rubrique('Nom')).toHaveTextContent('Benali');
    expect(rubrique('Prénom')).toHaveTextContent('Karim');
    expect(
      within(coordonnees()).getByRole('link', { name: 'karim.benali@plumbly.re' }),
    ).toHaveAttribute('href', 'mailto:karim.benali@plumbly.re');
    expect(
      within(coordonnees()).getByText(
        'Nom, prénom et e-mail viennent du compte de l’employé, modifiable par l’administrateur.',
      ),
    ).toBeInTheDocument();
    expect(rubrique('État du compte')).toHaveTextContent('Actif');
    expect(within(coordonnees()).getByRole('link', { name: '0692 12 34 56' })).toHaveAttribute(
      'href',
      'tel:0692123456',
    );
    expect(rubrique('Couleur du planning')).toHaveTextContent('#1E88E5');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à la liste des techniciens' })).toHaveAttribute(
      'href',
      '/techniciens',
    );
    expect(screen.queryByText('Archivé')).not.toBeInTheDocument();
  });

  it('US11 : signale un compte utilisateur désactivé', async () => {
    await ouvrirLaFiche({ ...karimDeTest(), compteActif: false });

    expect(screen.getByText('Compte désactivé')).toBeInTheDocument();
    expect(rubrique('État du compte')).toHaveTextContent('Désactivé');
  });

  it('US11 : une fiche introuvable (404) affiche le message générique, pas celui de l’API, et « Réessayer » la relit', async () => {
    const utilisateur = userEvent.setup();
    servirAucuneIndisponibilite();
    serveurApi.use(http.get(urlApi('/technicians/2'), () => HttpResponse.json(karimDeTest())));
    serveurApi.use(
      http.get(
        urlApi('/technicians/2'),
        () =>
          HttpResponse.json(
            { statusCode: 404, message: 'Technicien introuvable.' },
            { status: 404 },
          ),
        { once: true },
      ),
    );
    afficherAvecSession(
      <PageFicheTechnicien />,
      GESTIONNAIRE_DE_TEST,
      '/techniciens/2',
      '/techniciens/:id',
    );

    const alerte = await screen.findByRole('alert');

    expect(alerte).toHaveTextContent("L'élément demandé est introuvable.");
    expect(alerte).not.toHaveTextContent('Technicien introuvable.');
    expect(screen.getByRole('heading', { level: 1, name: 'Fiche technicien' })).toBeInTheDocument();

    await utilisateur.click(within(alerte).getByRole('button', { name: 'Réessayer' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Karim Benali' }),
    ).toBeInTheDocument();
  });
});

describe('modification du téléphone et de la couleur (US11)', () => {
  it('US11 : la fenêtre ne propose que le téléphone et la couleur ; seul le téléphone changé part, puis la fiche est relue', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFiche();
    const modifications = enregistrerLesRequetes('patch', '/technicians/2', () => {
      const modifie = { ...karimDeTest(), telephone: '0693998877' };
      remplacer(modifie);
      return HttpResponse.json(modifie);
    });
    const fenetre = await ouvrirLaModification(utilisateur);
    expect(
      within(fenetre)
        .getAllByRole('textbox')
        .map((champ) => champ.getAttribute('type')),
    ).toEqual(['tel']);
    const telephone = within(fenetre).getByRole('textbox', { name: 'Téléphone (obligatoire)' });
    expect(telephone).toHaveValue('0692123456');
    expect(telephone).toHaveFocus();
    expect(within(fenetre).getByLabelText('Couleur du planning')).toHaveValue('#1e88e5');

    await utilisateur.clear(telephone);
    await utilisateur.type(telephone, '0693 99 88 77');
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(modifications).toHaveLength(1);
    expect(JSON.parse(modifications[0].corps)).toEqual({ telephone: '0693998877' });
    expect(
      await within(coordonnees()).findByRole('link', { name: '0693 99 88 77' }),
    ).toBeInTheDocument();
    expect(lectures).toHaveLength(2);
    expect(bouton('Modifier le téléphone et la couleur')).toHaveFocus();
    expect(zoneDAnnonce()).toHaveTextContent('Fiche enregistrée.');
  });

  it('US11 : une nouvelle couleur part seule, en #RRGGBB majuscules, et sa valeur est écrite à côté du nuancier', async () => {
    const utilisateur = userEvent.setup();
    const { remplacer } = await ouvrirLaFiche();
    const modifications = enregistrerLesRequetes('patch', '/technicians/2', () => {
      const modifie = { ...karimDeTest(), couleurPlanning: '#C62828' };
      remplacer(modifie);
      return HttpResponse.json(modifie);
    });
    const fenetre = await ouvrirLaModification(utilisateur);
    const couleur = within(fenetre).getByLabelText('Couleur du planning');
    expect(couleur).toHaveAccessibleDescription('#1E88E5');

    // Un nuancier ne se tape pas : la valeur choisie arrive par l'événement input.
    fireEvent.input(couleur, { target: { value: '#c62828' } });
    expect(couleur).toHaveAccessibleDescription('#C62828');
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(modifications[0].corps)).toEqual({ couleurPlanning: '#C62828' });
    await waitFor(() => expect(rubrique('Couleur du planning')).toHaveTextContent('#C62828'));
  });

  it('US11 : enregistrer sans rien changer ferme la fenêtre sans appeler l’API', async () => {
    const utilisateur = userEvent.setup();
    // Aucun PATCH simulé : un envoi ferait échouer le test (requête non simulée).
    const { lectures } = await ouvrirLaFiche();
    const fenetre = await ouvrirLaModification(utilisateur);

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(lectures).toHaveLength(1);
    expect(zoneDAnnonce()).toBeEmptyDOMElement();
  });

  it('US11 : un téléphone invalide est signalé sur le champ, sans appel à l’API', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaFiche();
    const fenetre = await ouvrirLaModification(utilisateur);
    const telephone = within(fenetre).getByRole('textbox', { name: 'Téléphone (obligatoire)' });

    await utilisateur.clear(telephone);
    await utilisateur.type(telephone, '0692-12');
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    expect(telephone).toHaveAttribute('aria-invalid', 'true');
    expect(telephone).toHaveAccessibleDescription(
      '10 chiffres commençant par 0 ; espaces et points acceptés. Le téléphone doit contenir 10 chiffres commençant par 0 (espaces et points acceptés), par exemple 0692 12 34 56.',
    );
    await waitFor(() => expect(telephone).toHaveFocus());
  });

  it('US11 : un refus 400 de l’API s’affiche tel quel, la fenêtre reste ouverte et la fiche n’est pas relue', async () => {
    const utilisateur = userEvent.setup();
    const message = 'Ce technicien est archivé : sa fiche ne peut plus être modifiée.';
    const { lectures } = await ouvrirLaFiche();
    serveurApi.use(
      http.patch(urlApi('/technicians/2'), () =>
        HttpResponse.json({ statusCode: 400, message, error: 'Bad Request' }, { status: 400 }),
      ),
    );
    const fenetre = await ouvrirLaModification(utilisateur);
    const telephone = within(fenetre).getByRole('textbox', { name: 'Téléphone (obligatoire)' });
    await utilisateur.clear(telephone);
    await utilisateur.type(telephone, '0693998877');

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    );

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe(message);
    expect(
      within(fenetre).getByRole('button', { name: 'Enregistrer les modifications' }),
    ).toHaveFocus();
    expect(lectures).toHaveLength(1);
    expect(zoneDAnnonce()).toBeEmptyDOMElement();
  });
});

describe('archivage du technicien (US11, RG22)', () => {
  it('RG22 : demande confirmation ; « Annuler » n’appelle rien et rend le focus au bouton', async () => {
    const utilisateur = userEvent.setup();
    const { lectures } = await ouvrirLaFiche();
    const archivages = enregistrerLesRequetes('post', '/technicians/2/archive', () =>
      HttpResponse.json(karimArchive()),
    );

    await utilisateur.click(bouton('Archiver le technicien'));

    const fenetre = screen.getByRole('dialog', { name: 'Archiver le technicien ?' });
    expect(fenetre).toHaveTextContent('« Karim Benali » ne recevra plus de tournée');
    expect(fenetre).toHaveAccessibleDescription(
      /L’archivage est définitif : il ne peut pas être annulé\.$/,
    );
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toHaveFocus();

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bouton('Archiver le technicien')).toHaveFocus();
    expect(archivages).toHaveLength(0);
    expect(lectures).toHaveLength(1);
  });

  it('RG22 : « Archiver définitivement » appelle POST /technicians/2/archive ; la fiche relue est en lecture seule', async () => {
    const utilisateur = userEvent.setup();
    const { lectures, remplacer } = await ouvrirLaFiche();
    const archivages = enregistrerLesRequetes('post', '/technicians/2/archive', () => {
      remplacer(karimArchive());
      return HttpResponse.json(karimArchive());
    });
    await utilisateur.click(bouton('Archiver le technicien'));
    const fenetre = screen.getByRole('dialog', { name: 'Archiver le technicien ?' });

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Archiver définitivement' }),
    );

    expect(await screen.findByText('Archivé')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(archivages).toHaveLength(1);
    expect(archivages[0].corps).toBe('');
    expect(lectures).toHaveLength(2);
    expect(screen.getByText(/^Technicien archivé le 25\/11\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archiver le technicien' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Modifier le téléphone et la couleur' }),
    ).toBeNull();
    // Le bouton d'origine a disparu : le focus passe sur le nom du technicien.
    expect(screen.getByRole('heading', { level: 1, name: 'Karim Benali' })).toHaveFocus();
    expect(zoneDAnnonce()).toHaveTextContent(
      'Technicien archivé : sa fiche est désormais en lecture seule.',
    );
  });

  it('RG22 : le refus 409 (interventions à venir) s’affiche tel quel, et la fenêtre reste ouverte', async () => {
    const utilisateur = userEvent.setup();
    const { lectures } = await ouvrirLaFiche();
    serveurApi.use(
      http.post(urlApi('/technicians/2/archive'), () =>
        HttpResponse.json(
          { statusCode: 409, message: MESSAGE_INTERVENTIONS_A_VENIR, error: 'Conflict' },
          { status: 409 },
        ),
      ),
    );
    await utilisateur.click(bouton('Archiver le technicien'));
    const fenetre = screen.getByRole('dialog', { name: 'Archiver le technicien ?' });

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Archiver définitivement' }),
    );

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe(MESSAGE_INTERVENTIONS_A_VENIR);
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    expect(lectures).toHaveLength(1);
    expect(screen.queryByText('Archivé')).not.toBeInTheDocument();
  });

  it('RG22 : un technicien déjà archivé reste consultable, sans aucune action de modification', async () => {
    await ouvrirLaFiche(karimArchive());

    expect(screen.getByText('Archivé')).toBeInTheDocument();
    expect(screen.getByText(/^Technicien archivé le 25\/11\/2026/)).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(rubrique('Téléphone')).toHaveTextContent('0692 12 34 56');
  });
});
