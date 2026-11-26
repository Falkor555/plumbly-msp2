import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import type { Profil } from '../api/auth.api';
import { effacerJetonAcces } from '../api/jetonAcces';
import type { FicheTechnicien } from '../api/types';
import { enregistrerLesRequetes } from '../test/msw/requetesRecues';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { ADMINISTRATEUR_DE_TEST, afficherAvecSession, GESTIONNAIRE_DE_TEST } from '../test/session';
import {
  comptesDeTest,
  fabriquerCompte,
  fabriquerTechnicien,
  servirLesComptes,
  servirLesTechniciens,
  techniciensDeTest,
} from '../test/techniciensDeTest';
import { PageTechniciens } from './PageTechniciens';

type Utilisateur = ReturnType<typeof userEvent.setup>;

const AIDE_DU_GESTIONNAIRE =
  'Numéro du compte utilisateur de rôle technicien : l’administrateur vous le communique.';

afterEach(() => effacerJetonAcces());

/** Fiche que l'API renverrait pour Julie Roche (compte 14). */
function ficheDeJulie(): FicheTechnicien {
  return fabriquerTechnicien({
    id: 20,
    utilisateurId: 14,
    nom: 'Roche',
    prenom: 'Julie',
    email: 'julie.roche@plumbly.re',
    telephone: '0692112233',
    couleurPlanning: '#7B1FA2',
  });
}

/** Ouvre la liste au nom de ce profil ; garde chaque lecture de GET /technicians. */
async function ouvrirLaListe(
  profil: Profil,
  techniciens: FicheTechnicien[] = techniciensDeTest(),
): Promise<URLSearchParams[]> {
  const lectures = servirLesTechniciens(techniciens);
  await afficherAvecSession(<PageTechniciens />, profil, '/techniciens');
  await screen.findByRole('link', { name: 'Karim Benali' });
  return lectures;
}

async function ouvrirLaCreation(utilisateur: Utilisateur): Promise<HTMLElement> {
  await utilisateur.click(screen.getByRole('button', { name: 'Nouveau technicien' }));
  return screen.getByRole('dialog', { name: 'Nouveau technicien' });
}

function listeDesComptes(fenetre: HTMLElement): Promise<HTMLElement> {
  return within(fenetre).findByRole('combobox', { name: 'Compte du technicien (obligatoire)' });
}

function champ(fenetre: HTMLElement, nom: string): HTMLElement {
  return within(fenetre).getByRole('textbox', { name: nom });
}

function boutonCreer(fenetre: HTMLElement): HTMLElement {
  return within(fenetre).getByRole('button', { name: 'Créer la fiche' });
}

function refusDeLApi(statut: 400 | 409, message: string) {
  return http.post(urlApi('/technicians'), () =>
    HttpResponse.json(
      { statusCode: statut, message, error: statut === 400 ? 'Bad Request' : 'Conflict' },
      { status: statut },
    ),
  );
}

/** Saisie d'un gestionnaire : l'identifiant du compte et le téléphone. */
async function saisirLeCompte(
  utilisateur: Utilisateur,
  fenetre: HTMLElement,
  identifiant: string,
): Promise<void> {
  await utilisateur.type(champ(fenetre, 'Identifiant du compte (obligatoire)'), identifiant);
  await utilisateur.type(champ(fenetre, 'Téléphone (obligatoire)'), '0692 11 22 33');
}

describe('création par l’administrateur (US11)', () => {
  it('US11 : propose les comptes TECHNICIEN actifs sans fiche, archivée ou non, triés par nom', async () => {
    const utilisateur = userEvent.setup();
    const comptesLus = servirLesComptes(comptesDeTest());
    const lectures = await ouvrirLaListe(ADMINISTRATEUR_DE_TEST);

    const fenetre = await ouvrirLaCreation(utilisateur);

    // Le premier champ n'existe qu'une fois les comptes lus : le titre reçoit le focus.
    expect(within(fenetre).getByRole('heading', { name: 'Nouveau technicien' })).toHaveFocus();
    const liste = await listeDesComptes(fenetre);
    expect(
      within(liste)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Choisissez un compte',
      'Julie Roche — julie.roche@plumbly.re',
      'Rémi Técher — remi.techer@plumbly.re',
    ]);
    expect(liste).toHaveAccessibleDescription(
      'Comptes actifs de rôle technicien qui n’ont pas encore de fiche.',
    );
    expect(Object.fromEntries(comptesLus[0])).toEqual({
      role: 'TECHNICIEN',
      actif: 'true',
      tri: 'nom',
      page: '1',
      limit: '100',
    });
    // Les fiches archivées comptent : l'API refuse une seconde fiche pour le même compte (409).
    expect(Object.fromEntries(lectures[1])).toEqual({ archives: 'true', page: '1', limit: '100' });
    expect(comptesLus).toHaveLength(1);
  });

  it('US11 : crée la fiche du compte choisi, annonce le succès et relit la liste', async () => {
    const utilisateur = userEvent.setup();
    servirLesComptes(comptesDeTest());
    const techniciens = techniciensDeTest();
    const lectures = await ouvrirLaListe(ADMINISTRATEUR_DE_TEST, techniciens);
    const creations = enregistrerLesRequetes('post', '/technicians', () => {
      techniciens.push(ficheDeJulie());
      return HttpResponse.json(ficheDeJulie(), { status: 201 });
    });
    const zoneDAnnonce = screen.getByRole('status', { name: 'Confirmation' });
    expect(zoneDAnnonce).toBeEmptyDOMElement();
    const fenetre = await ouvrirLaCreation(utilisateur);

    await utilisateur.selectOptions(
      await listeDesComptes(fenetre),
      'Julie Roche — julie.roche@plumbly.re',
    );
    await utilisateur.type(champ(fenetre, 'Téléphone (obligatoire)'), '0692 11 22 33');
    await utilisateur.click(boutonCreer(fenetre));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(creations).toHaveLength(1);
    // Sans couleur choisie, l'API en attribue une : le champ n'est pas envoyé.
    expect(JSON.parse(creations[0].corps)).toEqual({ utilisateurId: 14, telephone: '0692112233' });
    const annonce = screen.getByText(/^Fiche de « Julie Roche » créée\./);
    expect(zoneDAnnonce).toContainElement(annonce);
    expect(within(annonce).getByRole('link', { name: 'Ouvrir sa fiche' })).toHaveAttribute(
      'href',
      '/techniciens/20',
    );
    expect(await screen.findByRole('link', { name: 'Julie Roche' })).toBeInTheDocument();
    // Lecture de la page, liste des fiches pour la fenêtre, puis relecture après la création.
    expect(lectures).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Nouveau technicien' })).toHaveFocus();
  });

  it('US11 : lit toutes les pages des comptes et des fiches avant de proposer un compte', async () => {
    const utilisateur = userEvent.setup();
    // 152 comptes sur deux pages : 150 sans fiche, Julie Roche, dont la fiche n'apparaît qu'en
    // 2e page des 101 fiches, puis Rémi Técher, qui n'arrive qu'en 2e page des comptes.
    const comptes = Array.from({ length: 150 }, (_, rang) =>
      fabriquerCompte({
        id: 1000 + rang,
        nom: `Compte${String(rang).padStart(3, '0')}`,
        prenom: 'A',
      }),
    );
    comptes.push(fabriquerCompte({ id: 14, nom: 'Roche', prenom: 'Julie' }));
    comptes.push(
      fabriquerCompte({ id: 15, nom: 'Técher', prenom: 'Rémi', email: 'remi.techer@plumbly.re' }),
    );
    const fiches = Array.from({ length: 100 }, (_, rang) =>
      fabriquerTechnicien({
        id: 500 + rang,
        utilisateurId: 5000 + rang,
        nom: 'Aaa',
        prenom: `B${rang}`,
      }),
    );
    fiches.push(fabriquerTechnicien({ id: 30, utilisateurId: 14, nom: 'Roche', prenom: 'Julie' }));
    const comptesLus = servirLesComptes(comptes);
    const lectures = servirLesTechniciens(fiches);
    await afficherAvecSession(<PageTechniciens />, ADMINISTRATEUR_DE_TEST, '/techniciens');
    await screen.findByRole('table');

    const fenetre = await ouvrirLaCreation(utilisateur);
    const liste = await listeDesComptes(fenetre);

    const options = within(liste).getAllByRole('option');
    expect(options).toHaveLength(1 + 150 + 1);
    expect(options.at(-1)).toHaveTextContent('Rémi Técher — remi.techer@plumbly.re');
    expect(within(liste).queryByRole('option', { name: /^Julie Roche/ })).toBeNull();
    expect(comptesLus.map((parametres) => parametres.get('page'))).toEqual(['1', '2']);
    expect(lectures.slice(1).map((parametres) => parametres.get('page'))).toEqual(['1', '2']);
  });

  it('US11 : dit clairement qu’aucun compte n’attend de fiche, sans formulaire à remplir', async () => {
    const utilisateur = userEvent.setup();
    servirLesComptes(comptesDeTest().filter(({ id }) => id !== 14 && id !== 15));
    let liberer: () => void = () => undefined;
    const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
    // Passé devant servirLesComptes : retient la lecture des comptes, puis la lui laisse.
    serveurApi.use(
      http.get(urlApi('/users'), async () => {
        await reponseRetenue;
      }),
    );
    await ouvrirLaListe(ADMINISTRATEUR_DE_TEST);
    const fenetre = await ouvrirLaCreation(utilisateur);
    // Le message de chargement est capturé d'abord : c'est lui qui change de texte.
    const statut = within(fenetre).getByRole('status');
    expect(statut).toHaveTextContent('Chargement des comptes techniciens…');
    expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toBeInTheDocument();

    liberer();

    await waitFor(() =>
      expect(statut).toHaveTextContent(
        'Aucun compte ne peut recevoir de fiche : chaque compte technicien actif en a déjà une.',
      ),
    );
    expect(within(fenetre).getByRole('status')).toBe(statut);
    expect(within(fenetre).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(fenetre).queryByRole('button', { name: 'Créer la fiche' })).toBeNull();

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Fermer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouveau technicien' })).toHaveFocus();
  });

  it.each([
    { issue: 'aboutit', reponse: () => undefined },
    { issue: 'échoue', reponse: () => HttpResponse.error() },
  ])(
    'US11 : quand la lecture des comptes $issue, le focus laissé sur « Annuler » revient au titre',
    async ({ reponse }) => {
      const utilisateur = userEvent.setup();
      servirLesComptes(comptesDeTest());
      let liberer: () => void = () => undefined;
      const reponseRetenue = new Promise<void>((resolve) => (liberer = resolve));
      // Passé devant servirLesComptes : retient la lecture des comptes, puis échoue ou la lui laisse.
      serveurApi.use(
        http.get(urlApi('/users'), async () => {
          await reponseRetenue;
          return reponse();
        }),
      );
      await ouvrirLaListe(ADMINISTRATEUR_DE_TEST);
      const fenetre = await ouvrirLaCreation(utilisateur);
      await utilisateur.tab();
      expect(within(fenetre).getByRole('button', { name: 'Annuler' })).toHaveFocus();

      liberer();

      // Le formulaire remplace le bouton qui avait le focus : sans repli, il tomberait sur le document.
      await within(fenetre).findByRole('button', { name: 'Créer la fiche' });
      expect(within(fenetre).getByRole('heading', { name: 'Nouveau technicien' })).toHaveFocus();
    },
  );

  it('US11 : si la liste des comptes ne peut pas être lue, l’alerte le dit et l’identifiant se saisit à la main', async () => {
    const utilisateur = userEvent.setup();
    serveurApi.use(http.get(urlApi('/users'), () => HttpResponse.error()));
    await ouvrirLaListe(ADMINISTRATEUR_DE_TEST);
    const creations = enregistrerLesRequetes('post', '/technicians', () =>
      HttpResponse.json(ficheDeJulie(), { status: 201 }),
    );

    const fenetre = await ouvrirLaCreation(utilisateur);

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte).toHaveTextContent(
      'La liste des comptes n’a pas pu être lue : saisissez l’identifiant du compte.',
    );
    expect(alerte).toHaveTextContent('Connexion au serveur impossible.');
    expect(within(fenetre).queryByRole('combobox')).not.toBeInTheDocument();

    await saisirLeCompte(utilisateur, fenetre, '14');
    await utilisateur.click(boutonCreer(fenetre));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(creations[0].corps)).toEqual({ utilisateurId: 14, telephone: '0692112233' });
  });

  it('US11 : si la liste des fiches ne peut pas être lue, l’alerte le dit et l’identifiant se saisit à la main', async () => {
    const utilisateur = userEvent.setup();
    const comptesLus = servirLesComptes(comptesDeTest());
    await ouvrirLaListe(ADMINISTRATEUR_DE_TEST);
    // Passé devant servirLesTechniciens : seule la lecture des fiches archivées comprises, celle de
    // la fenêtre, échoue ; la page, qui lit sans les archives, garde sa liste.
    serveurApi.use(
      http.get(urlApi('/technicians'), ({ request }) =>
        new URL(request.url).searchParams.get('archives') === 'true'
          ? HttpResponse.error()
          : undefined,
      ),
    );
    const creations = enregistrerLesRequetes('post', '/technicians', () =>
      HttpResponse.json(ficheDeJulie(), { status: 201 }),
    );

    const fenetre = await ouvrirLaCreation(utilisateur);

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte).toHaveTextContent(
      'La liste des comptes n’a pas pu être lue : saisissez l’identifiant du compte.',
    );
    expect(alerte).toHaveTextContent('Connexion au serveur impossible.');
    // Les comptes, eux, sont lus : sans les fiches, la liste proposerait des comptes déjà pourvus.
    await waitFor(() => expect(comptesLus).toHaveLength(1));
    expect(within(fenetre).queryByRole('combobox')).not.toBeInTheDocument();

    await saisirLeCompte(utilisateur, fenetre, '14');
    await utilisateur.click(boutonCreer(fenetre));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(creations[0].corps)).toEqual({ utilisateurId: 14, telephone: '0692112233' });
  });

  it('US11 : un compte non choisi est signalé sur la liste, sans appel à l’API', async () => {
    const utilisateur = userEvent.setup();
    servirLesComptes(comptesDeTest());
    await ouvrirLaListe(ADMINISTRATEUR_DE_TEST);
    const creations = enregistrerLesRequetes('post', '/technicians', () =>
      HttpResponse.json(ficheDeJulie(), { status: 201 }),
    );
    const fenetre = await ouvrirLaCreation(utilisateur);
    const liste = await listeDesComptes(fenetre);
    await utilisateur.type(champ(fenetre, 'Téléphone (obligatoire)'), '0692 11 22 33');

    await utilisateur.click(boutonCreer(fenetre));

    expect(liste).toHaveAttribute('aria-invalid', 'true');
    expect(liste).toHaveAccessibleDescription(
      'Comptes actifs de rôle technicien qui n’ont pas encore de fiche. Choisissez le compte du technicien dans la liste.',
    );
    await waitFor(() => expect(liste).toHaveFocus());
    expect(creations).toHaveLength(0);
  });
});

describe('création par le gestionnaire (US11)', () => {
  it('US11 : sans appel à GET /users, saisit l’identifiant du compte, envoyé en nombre et sans couleur', async () => {
    const utilisateur = userEvent.setup();
    const comptesLus = servirLesComptes(comptesDeTest());
    await ouvrirLaListe(GESTIONNAIRE_DE_TEST);
    const creations = enregistrerLesRequetes('post', '/technicians', () =>
      HttpResponse.json(ficheDeJulie(), { status: 201 }),
    );
    const fenetre = await ouvrirLaCreation(utilisateur);
    const identifiant = champ(fenetre, 'Identifiant du compte (obligatoire)');
    expect(identifiant).toHaveAttribute('inputmode', 'numeric');
    expect(identifiant).toHaveAccessibleDescription(AIDE_DU_GESTIONNAIRE);
    expect(within(fenetre).getByRole('checkbox', { name: 'Choisir la couleur' })).not.toBeChecked();

    await saisirLeCompte(utilisateur, fenetre, '14');
    await utilisateur.click(boutonCreer(fenetre));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(creations[0].corps)).toEqual({ utilisateurId: 14, telephone: '0692112233' });
    expect(comptesLus).toHaveLength(0);
  });

  it('US11 : la couleur choisie part en #RRGGBB majuscules', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaListe(GESTIONNAIRE_DE_TEST);
    const creations = enregistrerLesRequetes('post', '/technicians', () =>
      HttpResponse.json(ficheDeJulie(), { status: 201 }),
    );
    const fenetre = await ouvrirLaCreation(utilisateur);
    await saisirLeCompte(utilisateur, fenetre, '14');

    await utilisateur.click(within(fenetre).getByRole('checkbox', { name: 'Choisir la couleur' }));
    const couleur = within(fenetre).getByLabelText('Couleur choisie');
    expect(couleur).toHaveValue('#0f766e');
    // Un nuancier ne se tape pas : la valeur choisie arrive par l'événement input.
    fireEvent.input(couleur, { target: { value: '#7b1fa2' } });
    expect(couleur).toHaveAccessibleDescription('#7B1FA2');
    await utilisateur.click(boutonCreer(fenetre));

    await waitFor(() => expect(creations).toHaveLength(1));
    expect(JSON.parse(creations[0].corps)).toEqual({
      utilisateurId: 14,
      telephone: '0692112233',
      couleurPlanning: '#7B1FA2',
    });
  });

  it.each([
    ['vide', '', 'Saisissez l’identifiant du compte, par exemple 12.'],
    [
      'qui n’est pas un nombre',
      'Karim',
      'L’identifiant du compte est un nombre entier positif, par exemple 12.',
    ],
    ['nul', '0', 'L’identifiant du compte est un nombre entier positif, par exemple 12.'],
  ])(
    'US11 : un identifiant %s est signalé sur le champ, sans appel à l’API',
    async (_cas, saisie, message) => {
      const utilisateur = userEvent.setup();
      await ouvrirLaListe(GESTIONNAIRE_DE_TEST);
      const creations = enregistrerLesRequetes('post', '/technicians', () =>
        HttpResponse.json(ficheDeJulie(), { status: 201 }),
      );
      const fenetre = await ouvrirLaCreation(utilisateur);
      if (saisie !== '') {
        await utilisateur.type(champ(fenetre, 'Identifiant du compte (obligatoire)'), saisie);
      }
      await utilisateur.type(champ(fenetre, 'Téléphone (obligatoire)'), '0692 11 22 33');

      await utilisateur.click(boutonCreer(fenetre));

      const identifiant = champ(fenetre, 'Identifiant du compte (obligatoire)');
      expect(identifiant).toHaveAttribute('aria-invalid', 'true');
      expect(identifiant).toHaveAccessibleDescription(`${AIDE_DU_GESTIONNAIRE} ${message}`);
      await waitFor(() => expect(identifiant).toHaveFocus());
      expect(within(fenetre).getByRole('alert')).toHaveTextContent(
        'Un champ est à corriger : son message est affiché sous lui.',
      );
      expect(creations).toHaveLength(0);
    },
  );

  it('US11 : créer une fiche pour un compte qui en a déjà une affiche le 409 tel quel, la fenêtre restant ouverte', async () => {
    const utilisateur = userEvent.setup();
    const lectures = await ouvrirLaListe(GESTIONNAIRE_DE_TEST);
    serveurApi.use(refusDeLApi(409, 'Ce compte a déjà une fiche technicien.'));
    const fenetre = await ouvrirLaCreation(utilisateur);
    await saisirLeCompte(utilisateur, fenetre, '7');

    await utilisateur.click(boutonCreer(fenetre));

    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe('Ce compte a déjà une fiche technicien.');
    expect(screen.getByRole('dialog', { name: 'Nouveau technicien' })).toBeInTheDocument();
    await waitFor(() => expect(boutonCreer(fenetre)).toHaveFocus());
    expect(champ(fenetre, 'Identifiant du compte (obligatoire)')).toHaveValue('7');
    expect(lectures).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'Confirmation' })).toBeEmptyDOMElement();
  });

  it.each([
    ['inexistant', '999', 'Le compte utilisateur indiqué n’existe pas.'],
    [
      'désactivé',
      '16',
      'Ce compte utilisateur est désactivé : réactivez-le avant de créer sa fiche technicien.',
    ],
    [
      'd’un autre rôle',
      '3',
      'Ce compte a le rôle GESTIONNAIRE : seul un compte TECHNICIEN peut avoir une fiche technicien.',
    ],
  ])(
    'US11 : le refus 400 d’un compte %s s’affiche tel quel',
    async (_cas, identifiant, message) => {
      const utilisateur = userEvent.setup();
      await ouvrirLaListe(GESTIONNAIRE_DE_TEST);
      serveurApi.use(refusDeLApi(400, message));
      const fenetre = await ouvrirLaCreation(utilisateur);
      await saisirLeCompte(utilisateur, fenetre, identifiant);

      await utilisateur.click(boutonCreer(fenetre));

      const alerte = await within(fenetre).findByRole('alert');
      expect(alerte.textContent).toBe(message);
      expect(screen.getByRole('dialog', { name: 'Nouveau technicien' })).toBeInTheDocument();
    },
  );

  it('US11 : « Annuler » ferme la fenêtre sans rien envoyer et rend le focus au bouton', async () => {
    const utilisateur = userEvent.setup();
    const lectures = await ouvrirLaListe(GESTIONNAIRE_DE_TEST);
    const creations = enregistrerLesRequetes('post', '/technicians', () =>
      HttpResponse.json(ficheDeJulie(), { status: 201 }),
    );
    const fenetre = await ouvrirLaCreation(utilisateur);
    await saisirLeCompte(utilisateur, fenetre, '14');

    await utilisateur.click(within(fenetre).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouveau technicien' })).toHaveFocus();
    expect(creations).toHaveLength(0);
    expect(lectures).toHaveLength(1);
  });

  it('US11 : Maj+Tab depuis le titre passe au dernier bouton de la fenêtre, sans gagner la page derrière le voile', async () => {
    const utilisateur = userEvent.setup();
    await ouvrirLaListe(GESTIONNAIRE_DE_TEST);
    const fenetre = await ouvrirLaCreation(utilisateur);
    expect(within(fenetre).getByRole('heading', { name: 'Nouveau technicien' })).toHaveFocus();

    await utilisateur.tab({ shift: true });

    // Le titre, hors de l'ordre de tabulation, précède le premier champ : sans garde, le focus
    // irait au bouton « Nouveau technicien » de la page.
    expect(boutonCreer(fenetre)).toHaveFocus();

    await utilisateur.tab();

    expect(champ(fenetre, 'Identifiant du compte (obligatoire)')).toHaveFocus();
  });
});
