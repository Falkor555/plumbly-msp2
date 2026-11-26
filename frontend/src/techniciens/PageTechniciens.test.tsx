import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { effacerJetonAcces } from '../api/jetonAcces';
import type { FicheTechnicien } from '../api/types';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { afficherAvecSession, GESTIONNAIRE_DE_TEST } from '../test/session';
import {
  fabriquerTechnicien,
  servirLesTechniciens,
  techniciensDeTest,
} from '../test/techniciensDeTest';
import { PageTechniciens } from './PageTechniciens';

/*
 * Minuteurs réels : le délai de frappe est de 300 ms et findBy attend jusqu'à 1 s. Les minuteurs
 * factices bloqueraient findBy et MSW.
 */

afterEach(() => effacerJetonAcces());

async function afficherLaListe(): Promise<void> {
  await afficherAvecSession(<PageTechniciens />, GESTIONNAIRE_DE_TEST, '/techniciens');
}

async function attendreLaListe(): Promise<void> {
  await screen.findByRole('link', { name: 'Karim Benali' });
}

function champRecherche(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Rechercher un technicien' });
}

function navigationDesPages(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Pages de la liste des techniciens' });
}

/** Région live du nombre de techniciens, montée en permanence, même sans liste affichée. */
function zoneDuTotal(): HTMLElement {
  return screen.getByRole('status', { name: 'Nombre de techniciens' });
}

/** Message de liste vide affiché à l'écran, hors de la zone du total qui en porte le même texte. */
function messageAffiche(texte: string): Promise<HTMLElement> {
  return screen.findByText(texte, { ignore: 'script, style, .sr-only' });
}

function ligneDe(nom: string): HTMLElement {
  return screen.getByRole('rowheader', { name: new RegExp(nom) }).closest('tr') as HTMLElement;
}

function nomsAffiches(): string[] {
  return within(screen.getByRole('table'))
    .getAllByRole('link')
    .map((lien) => lien.textContent ?? '');
}

/** Les trois techniciens en service, puis vingt-deux autres : 25 en tout, sur deux pages. */
function vingtCinqTechniciens(): FicheTechnicien[] {
  const autres = Array.from({ length: 22 }, (_, rang) =>
    fabriquerTechnicien({
      id: 100 + rang,
      nom: `Zéphyr${String(rang + 1).padStart(2, '0')}`,
      prenom: 'Paul',
    }),
  );
  return [...techniciensDeTest().filter((technicien) => !technicien.archive), ...autres];
}

describe('liste des techniciens (US11)', () => {
  it('US11 : affiche les techniciens en service avec leur pastille, leur e-mail et leur téléphone', async () => {
    const recues = servirLesTechniciens(techniciensDeTest());

    await afficherLaListe();
    await attendreLaListe();

    expect(screen.getByRole('heading', { level: 1, name: 'Techniciens' })).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Techniciens : nom, e-mail et téléphone' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((entete) => entete.textContent)).toEqual([
      'Nom',
      'E-mail',
      'Téléphone',
    ]);
    expect(nomsAffiches()).toEqual(['Karim Benali', 'Loïc Grondin', 'Mickaël Hoarau']);
    expect(screen.getByRole('link', { name: 'Karim Benali' })).toHaveAttribute(
      'href',
      '/techniciens/2',
    );
    const karim = within(ligneDe('Karim Benali')).getAllByRole('cell');
    expect(karim.map((cellule) => cellule.textContent)).toEqual([
      'karim.benali@plumbly.re',
      '0692 12 34 56',
    ]);
    expect(screen.queryByText('Sébastien Payet')).not.toBeInTheDocument();
    expect(within(navigationDesPages()).getByText('3 techniciens')).toBeInTheDocument();
    expect(zoneDuTotal()).toHaveTextContent('3 techniciens');
    expect(Object.fromEntries(recues[0])).toEqual({ tri: 'nom', page: '1', limit: '20' });
  });

  it('US11 : la pastille reprend la couleur du planning, avec des initiales noires sur fond clair et blanches sur fond foncé', async () => {
    servirLesTechniciens(techniciensDeTest());

    await afficherLaListe();
    await attendreLaListe();

    const clair = within(ligneDe('Loïc Grondin')).getByText('LG');
    const fonce = within(ligneDe('Mickaël Hoarau')).getByText('MH');
    expect(clair).toHaveStyle({ backgroundColor: '#FFEB3B' });
    expect(clair).toHaveClass('text-black');
    expect(fonce).toHaveStyle({ backgroundColor: '#5D4037' });
    expect(fonce).toHaveClass('text-white');
    // Décorative : le nom écrit à côté suffit aux lecteurs d'écran.
    expect(clair).toHaveAttribute('aria-hidden', 'true');
    expect(within(ligneDe('Loïc Grondin')).getByRole('rowheader')).toHaveAccessibleName(
      'Loïc Grondin',
    );
  });

  it('US11 : signale un technicien dont le compte utilisateur est désactivé', async () => {
    servirLesTechniciens(techniciensDeTest());

    await afficherLaListe();
    await attendreLaListe();

    expect(within(ligneDe('Mickaël Hoarau')).getByText('Compte désactivé')).toBeInTheDocument();
    expect(within(ligneDe('Karim Benali')).queryByText('Compte désactivé')).not.toBeInTheDocument();
  });

  it('US11 : la recherche « loic » part une seule fois, après le délai de frappe, et retrouve Loïc Grondin', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesTechniciens(techniciensDeTest());
    await afficherLaListe();
    await attendreLaListe();

    await utilisateur.type(champRecherche(), 'loic');

    // Juste après la frappe, le délai n'est pas écoulé : aucune requête n'est partie.
    expect(recues).toHaveLength(1);
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Karim Benali' })).not.toBeInTheDocument(),
    );
    expect(nomsAffiches()).toEqual(['Loïc Grondin']);
    expect(recues.map((parametres) => parametres.get('recherche'))).toEqual([null, 'loic']);
    expect(recues[1].get('page')).toBe('1');
    expect(zoneDuTotal()).toHaveTextContent('1 technicien');
  });

  it('US11 : une recherche d’un seul caractère, même entouré d’espaces, n’interroge pas l’API', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesTechniciens(techniciensDeTest());
    await afficherLaListe();
    await attendreLaListe();

    await utilisateur.type(champRecherche(), ' k ');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(recues).toHaveLength(1);
    expect(nomsAffiches()).toHaveLength(3);
  });

  it('US11 : limite la recherche à 100 caractères et explique ce qu’elle couvre', async () => {
    servirLesTechniciens(techniciensDeTest());
    await afficherLaListe();
    await attendreLaListe();

    expect(champRecherche()).toHaveAttribute('maxLength', '100');
    expect(champRecherche()).toHaveAccessibleDescription('Nom ou prénom, au moins 2 caractères.');
  });

  it('US11 : « Inclure les archivés » envoie archives=true et signale le technicien archivé', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesTechniciens(techniciensDeTest());
    await afficherLaListe();
    await attendreLaListe();

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Inclure les archivés' }));

    expect(await screen.findByRole('link', { name: 'Sébastien Payet' })).toBeInTheDocument();
    expect(within(ligneDe('Sébastien Payet')).getByText('Archivé')).toBeInTheDocument();
    expect(within(ligneDe('Karim Benali')).queryByText('Archivé')).not.toBeInTheDocument();
    expect(recues.at(-1)?.get('archives')).toBe('true');

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Inclure les archivés' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Sébastien Payet' })).not.toBeInTheDocument(),
    );
    expect(recues.at(-1)?.has('archives')).toBe(false);
  });

  it('US11 : « Nom, de Z à A » envoie tri=-nom et inverse l’ordre de la liste', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesTechniciens(techniciensDeTest());
    await afficherLaListe();
    await attendreLaListe();
    expect(screen.getByLabelText('Trier par')).toHaveValue('nom');

    await utilisateur.selectOptions(screen.getByLabelText('Trier par'), 'Nom, de Z à A');

    await waitFor(() =>
      expect(nomsAffiches()).toEqual(['Mickaël Hoarau', 'Loïc Grondin', 'Karim Benali']),
    );
    expect(recues.map((parametres) => parametres.get('tri'))).toEqual(['nom', '-nom']);
  });

  it('US11 : pagine par 20 ; changer le tri depuis la page 2 revient à la page 1', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesTechniciens(vingtCinqTechniciens());
    await afficherLaListe();
    await attendreLaListe();
    expect(within(navigationDesPages()).getByText('Page 1 sur 2')).toBeInTheDocument();

    await utilisateur.click(within(navigationDesPages()).getByRole('button', { name: 'Suivante' }));

    expect(await screen.findByRole('link', { name: 'Paul Zéphyr22' })).toBeInTheDocument();
    expect(nomsAffiches()).toHaveLength(5);

    await utilisateur.selectOptions(screen.getByLabelText('Trier par'), 'Nom, de Z à A');

    await waitFor(() => expect(recues).toHaveLength(3));
    expect(Object.fromEntries(recues[2])).toEqual({ tri: '-nom', page: '1', limit: '20' });
    expect(await screen.findByText('Page 1 sur 2')).toBeInTheDocument();
  });

  it('US11 : distingue une liste vide d’une recherche sans résultat', async () => {
    const utilisateur = userEvent.setup();
    servirLesTechniciens([]);
    await afficherLaListe();

    expect(await messageAffiche('Aucun technicien enregistré pour le moment.')).toBeInTheDocument();
    expect(zoneDuTotal()).toHaveTextContent('Aucun technicien enregistré pour le moment.');

    await utilisateur.type(champRecherche(), 'zz');

    expect(
      await messageAffiche('Aucun technicien ne correspond à ces critères.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('US11 : une liste vide, archivés inclus et sans recherche, dit qu’aucun technicien n’est enregistré', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesTechniciens([]);
    await afficherLaListe();
    await messageAffiche('Aucun technicien enregistré pour le moment.');

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Inclure les archivés' }));

    // La zone du total, vidée par la nouvelle lecture, ne reprend un texte qu'à sa réponse.
    await waitFor(() => expect(recues).toHaveLength(2));
    expect(recues[1].get('archives')).toBe('true');
    // Les archivés élargissent la liste : vide, elle ne compte aucun technicien, en service ou non.
    await waitFor(() =>
      expect(zoneDuTotal()).toHaveTextContent('Aucun technicien enregistré pour le moment.'),
    );
    expect(await messageAffiche('Aucun technicien enregistré pour le moment.')).toBeInTheDocument();
    expect(
      screen.queryByText('Aucun technicien ne correspond à ces critères.'),
    ).not.toBeInTheDocument();
  });

  it('US11 : une panne réseau affiche une alerte, puis « Réessayer » relit la liste', async () => {
    const utilisateur = userEvent.setup();
    const recues = servirLesTechniciens(techniciensDeTest());
    serveurApi.use(http.get(urlApi('/technicians'), () => HttpResponse.error(), { once: true }));
    await afficherLaListe();

    const alerte = await screen.findByRole('alert');

    expect(alerte).toHaveTextContent(
      'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await utilisateur.click(within(alerte).getByRole('button', { name: 'Réessayer' }));

    await attendreLaListe();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(recues).toHaveLength(1);
  });
});
