import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  creerJeuDeDemonstration,
  type JeuDeDemonstration,
} from '../simulation/donneesDemonstration';
import { creerHandlersPlanning } from '../simulation/handlersPlanning';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PagePlanning } from './PagePlanning';

const LUNDI = '2026-11-23';
const MERCREDI = '2026-11-25';

let requetesPlanning: URLSearchParams[];

beforeEach(() => {
  requetesPlanning = [];
  serveurApi.use(
    ...creerHandlersPlanning(creerJeuDeDemonstration(LUNDI), { urlApi, aujourdhui: () => LUNDI }),
  );
  serveurApi.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/tours') && request.method === 'GET') {
      requetesPlanning.push(url.searchParams);
    }
  });
  return () => serveurApi.events.removeAllListeners();
});

function ligneDuTechnicien(nom: string): HTMLElement {
  const entete = screen.getByRole('rowheader', { name: new RegExp(nom) });
  return entete.closest('tr') as HTMLElement;
}

describe('planning du gestionnaire', () => {
  it("affiche la semaine du lundi au samedi qui contient aujourd'hui, avec une ligne par technicien", async () => {
    render(<PagePlanning aujourdhui={MERCREDI} />);

    expect(await screen.findByRole('rowheader', { name: /Jean Rivière/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Marie Técher/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Paul Lebon/ })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    expect(screen.getByText('Semaine du 23/11 au 28/11')).toBeInTheDocument();
    expect(requetesPlanning[0]?.get('du')).toBe('2026-11-23');
    expect(requetesPlanning[0]?.get('au')).toBe('2026-11-28');
  });

  it("place les interventions dans la case du technicien et du jour, à l'heure de La Réunion", async () => {
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });

    const caseLundi = within(ligneDuTechnicien('Jean Rivière')).getAllByRole('cell')[0];
    expect(
      within(caseLundi).getByRole('article', { name: /08:00–09:00, Mme Hoarau/ }),
    ).toBeInTheDocument();
    expect(within(caseLundi).getByText('Urgente')).toBeInTheDocument();
    expect(within(caseLundi).getByText('En cours')).toBeInTheDocument();
  });

  it('grise la journée où le technicien est indisponible, avec le motif', async () => {
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Marie Técher/ });

    const caseJeudi = within(ligneDuTechnicien('Marie Técher')).getAllByRole('cell')[3];
    expect(within(caseJeudi).getByText('Indisponible')).toBeInTheDocument();
    expect(within(caseJeudi).getByText(/Formation/)).toBeInTheDocument();
  });

  it('ne garde que le technicien choisi dans le filtre, et revient à tous', async () => {
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });

    await utilisateur.selectOptions(screen.getByLabelText('Technicien'), 'Marie Técher');

    expect(screen.queryByRole('rowheader', { name: /Jean Rivière/ })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Marie Técher/ })).toBeInTheDocument();

    await utilisateur.selectOptions(screen.getByLabelText('Technicien'), 'Tous les techniciens');

    expect(screen.getAllByRole('rowheader')).toHaveLength(3);
  });

  it('passe à la semaine suivante et relit le planning de cette période', async () => {
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });

    await utilisateur.click(screen.getByRole('button', { name: 'Semaine suivante' }));

    expect(await screen.findByText('Semaine du 30/11 au 05/12')).toBeInTheDocument();
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });
    expect(requetesPlanning.at(-1)?.get('du')).toBe('2026-11-30');
    expect(screen.queryByText('Mme Hoarau')).not.toBeInTheDocument();
  });

  it("bascule en vue jour sur la frise horaire et ne demande que ce jour à l'API", async () => {
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });

    await utilisateur.click(screen.getByRole('button', { name: 'jour' }));

    const tourneeJean = await screen.findByRole('list', { name: 'Tournée de Jean Rivière' });
    const etapes = within(tourneeJean).getAllByRole('listitem');
    expect(etapes).toHaveLength(2);
    expect(etapes[0]).toHaveTextContent('Étape 1 : 08:00–09:00');
    expect(etapes[1]).toHaveTextContent('Étape 2 : 10:00–11:30');
    expect(requetesPlanning.at(-1)?.get('du')).toBe(LUNDI);
    expect(requetesPlanning.at(-1)?.get('au')).toBe(LUNDI);
  });

  it("annonce l'urgence et le statut des blocs de la vue jour, et les explique dans la légende", async () => {
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });

    await utilisateur.click(screen.getByRole('button', { name: 'jour' }));

    const tourneeJean = await screen.findByRole('list', { name: 'Tournée de Jean Rivière' });
    const [fuite, chauffeEau] = within(tourneeJean).getAllByRole('button');
    expect(chauffeEau).toHaveAccessibleName(/^Urgente.*10:00–11:30.*En cours$/);
    expect(fuite).toHaveAccessibleName(/08:00–09:00.*Planifiée$/);
    expect(fuite).not.toHaveAccessibleName(/Urgente/);
    const legende = screen.getByRole('list', { name: 'Légende des statuts' });
    expect(
      within(legende)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Planifiée', 'En cours', 'Terminée', 'Annulée', 'Urgente ou prioritaire']);
  });

  it("ouvre la vue jour d'une date en cliquant sur l'en-tête de colonne", async () => {
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });

    await utilisateur.click(screen.getByRole('button', { name: /Voir le mardi 24 novembre 2026/ }));

    expect(await screen.findByRole('list', { name: 'Tournée de Marie Técher' })).toHaveTextContent(
      'M. Fontaine',
    );
    expect(screen.getByRole('button', { name: 'jour' })).toHaveAttribute('aria-pressed', 'true');
  });

  it("affiche un message générique et permet de réessayer quand l'API est en panne", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    serveurApi.use(
      http.get(
        urlApi('/tours'),
        () => HttpResponse.json({ statusCode: 500, message: 'stack trace' }, { status: 500 }),
        {
          once: true,
        },
      ),
    );
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Une erreur est survenue. Réessayez plus tard.');
    expect(alerte).not.toHaveTextContent('stack trace');

    await utilisateur.click(within(alerte).getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByRole('rowheader', { name: /Jean Rivière/ })).toBeInTheDocument();
  });
});

/** Le jeu de démonstration, avec des infos d'accès sur l'intervention de Mme Hoarau (id 1). */
function jeuAvecInfosAcces(infosAcces: string): JeuDeDemonstration {
  const jeu = creerJeuDeDemonstration(LUNDI);
  return {
    ...jeu,
    techniciens: jeu.techniciens.map((technicien) => ({
      ...technicien,
      tournees: technicien.tournees.map((tournee) => ({
        ...tournee,
        interventions: tournee.interventions.map((intervention) =>
          intervention.id === 1
            ? { ...intervention, adresse: { ...intervention.adresse, infosAcces } }
            : intervention,
        ),
      })),
    })),
  };
}

describe("détail d'une intervention du planning", () => {
  it("ouvre le détail au clic en vue semaine, sans nouvel appel à l'API", async () => {
    serveurApi.use(
      ...creerHandlersPlanning(jeuAvecInfosAcces('Portail vert, sonner deux fois'), {
        urlApi,
        aujourdhui: () => LUNDI,
      }),
    );
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });
    const requetesAvantOuverture = requetesPlanning.length;
    const carte = screen.getByRole('article', { name: /08:00–09:00, Mme Hoarau/ });

    await utilisateur.click(within(carte).getByRole('button'));

    const detail = screen.getByRole('dialog', { name: 'Recherche de fuite' });
    expect(detail).toHaveTextContent('08:00–09:00');
    expect(within(detail).getByText('Planifiée')).toBeInTheDocument();
    expect(detail).toHaveTextContent('Mme Hoarau');
    expect(within(detail).getByRole('link', { name: '0692 12 34 56' })).toHaveAttribute(
      'href',
      'tel:0692123456',
    );
    expect(detail).toHaveTextContent('1 rue des Flamboyants');
    expect(detail).toHaveTextContent('97400 Saint-Denis');
    expect(detail).toHaveTextContent('Portail vert, sonner deux fois');
    expect(detail).toHaveTextContent('Recherche de fuite chez Mme Hoarau');
    expect(requetesPlanning).toHaveLength(requetesAvantOuverture);
  });

  it("n'affiche pas la rubrique Accès quand l'adresse n'a pas d'infos d'accès", async () => {
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });

    await utilisateur.click(
      within(screen.getByRole('article', { name: /08:00–09:00, Mme Hoarau/ })).getByRole('button'),
    );

    const detail = screen.getByRole('dialog', { name: 'Recherche de fuite' });
    expect(within(detail).queryByText('Accès')).not.toBeInTheDocument();
  });

  it('se ferme avec Échap et rend le focus à la carte cliquée', async () => {
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });
    const boutonCarte = within(
      screen.getByRole('article', { name: /08:00–09:00, Mme Hoarau/ }),
    ).getByRole('button');
    await utilisateur.click(boutonCarte);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await utilisateur.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boutonCarte).toHaveFocus();
  });

  it('ouvre le détail avec Entrée en vue jour et se ferme par le bouton Fermer', async () => {
    const utilisateur = userEvent.setup();
    render(<PagePlanning aujourdhui={LUNDI} />);
    await screen.findByRole('rowheader', { name: /Jean Rivière/ });
    await utilisateur.click(screen.getByRole('button', { name: 'jour' }));
    const tourneeJean = await screen.findByRole('list', { name: 'Tournée de Jean Rivière' });
    const blocChauffeEau = within(tourneeJean).getByRole('button', { name: /10:00–11:30/ });
    blocChauffeEau.focus();

    await utilisateur.keyboard('{Enter}');

    const detail = screen.getByRole('dialog', { name: 'Chauffe-eau' });
    expect(detail).toHaveTextContent('Boulangerie Grondin');
    expect(within(detail).getByText('En cours')).toBeInTheDocument();
    expect(within(detail).getByText('Urgente')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Fermer' })).toHaveFocus();

    await utilisateur.click(within(detail).getByRole('button', { name: 'Fermer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(blocChauffeEau).toHaveFocus();
  });
});
