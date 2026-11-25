import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Tournee } from '../api/types';
import { fabriquerIntervention, planifier } from '../simulation/donneesDemonstration';
import { creerHandlersInterventions } from '../simulation/handlersInterventions';
import { creerHandlersPlanning } from '../simulation/handlersPlanning';
import { simulerCanvas } from '../test/canvas';
import { creerJeuDeTerrain, JOUR_DE_TERRAIN } from '../test/jeuDeTerrain';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { PageMaTournee } from './PageMaTournee';

const JOUR = '2026-11-24';

function tourneeDuJour(): Tournee {
  const premiere = planifier(
    fabriquerIntervention({
      id: 1,
      client: 'Mme Hoarau',
      type: 'Recherche de fuite',
      ville: 'Saint-Denis',
      dureeEstimeeMin: 60,
    }),
    JOUR,
    '08:00',
    1,
  );
  const seconde = {
    ...planifier(
      fabriquerIntervention({
        id: 2,
        client: 'Boulangerie Grondin',
        typeClient: 'PROFESSIONNEL',
        type: 'Chauffe-eau',
        ville: 'Sainte-Marie',
        dureeEstimeeMin: 90,
        urgence: 'URGENTE',
      }),
      JOUR,
      '10:00',
      2,
    ),
    adresse: {
      id: 200,
      rue: '12 rue de Paris',
      complement: 'Bâtiment B',
      codePostal: '97438',
      ville: 'Sainte-Marie',
      infosAcces: 'Code portail 1234',
    },
  };
  return {
    id: 10,
    dateTournee: JOUR,
    technicien: {
      id: 1,
      nom: 'Rivière',
      prenom: 'Jean',
      telephone: '0692 11 11 11',
      couleurPlanning: '#0F766E',
    },
    interventions: [premiere, seconde],
  };
}

describe('ma tournée du jour (technicien)', () => {
  it("liste les interventions dans l'ordre de passage avec l'adresse et l'accès", async () => {
    serveurApi.use(http.get(urlApi('/tours/me/today'), () => HttpResponse.json(tourneeDuJour())));

    render(<PageMaTournee />);

    const etapes = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(etapes).toHaveLength(2);
    expect(screen.getByText("2 interventions, dans l'ordre de passage")).toBeInTheDocument();
    expect(etapes[0]).toHaveTextContent('Étape 1 : 08:00–09:00');
    expect(etapes[0]).toHaveTextContent('Mme Hoarau');
    expect(etapes[1]).toHaveTextContent('Étape 2 : 10:00–11:30');
    expect(etapes[1]).toHaveTextContent('Bâtiment B');
    expect(etapes[1]).toHaveTextContent('Code portail 1234');
    expect(within(etapes[1]).getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('mardi 24 novembre 2026')).toBeInTheDocument();
  });

  it('propose un lien pour appeler le client, sans espaces dans le numéro', async () => {
    serveurApi.use(http.get(urlApi('/tours/me/today'), () => HttpResponse.json(tourneeDuJour())));

    render(<PageMaTournee />);

    const liens = await screen.findAllByRole('link', { name: /Appeler le client/ });
    expect(liens[0]).toHaveAttribute('href', 'tel:0692123456');
  });

  it("ouvre l'itinéraire vers l'adresse de chaque étape, encodée, dans un nouvel onglet", async () => {
    serveurApi.use(http.get(urlApi('/tours/me/today'), () => HttpResponse.json(tourneeDuJour())));

    render(<PageMaTournee />);

    const etapes = within(await screen.findByRole('list')).getAllByRole('listitem');
    const itineraire = within(etapes[1]).getByRole('link', { name: /Itinéraire/ });
    expect(itineraire).toHaveTextContent('12 rue de Paris');
    expect(itineraire).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=12%20rue%20de%20Paris%2C%2097438%20Sainte-Marie',
    );
    expect(itineraire).toHaveAttribute('target', '_blank');
    expect(itineraire).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it("indique qu'il n'y a pas de tournée quand l'API répond 204", async () => {
    serveurApi.use(
      http.get(urlApi('/tours/me/today'), () => new HttpResponse(null, { status: 204 })),
    );

    render(<PageMaTournee />);

    expect(await screen.findByText("Vous n'avez pas de tournée aujourd'hui.")).toBeInTheDocument();
  });

  it('indique une tournée créée mais encore vide', async () => {
    serveurApi.use(
      http.get(urlApi('/tours/me/today'), () =>
        HttpResponse.json({ ...tourneeDuJour(), interventions: [] }),
      ),
    );

    render(<PageMaTournee />);

    expect(
      await screen.findByText('Aucune intervention prévue pour le moment.'),
    ).toBeInTheDocument();
  });

  it('montre un message de droits sans détail technique quand le compte est refusé (403)', async () => {
    serveurApi.use(
      http.get(urlApi('/tours/me/today'), () =>
        HttpResponse.json({ statusCode: 403, message: 'Forbidden resource' }, { status: 403 }),
      ),
    );

    render(<PageMaTournee />);

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent("Vous n'avez pas les droits pour effectuer cette action.");
    expect(alerte).not.toHaveTextContent('Forbidden resource');
  });
});

describe('actions sur le terrain (US17, US18, US33)', () => {
  /** Tournée du jour avec une étape de chaque état, servie par la simulation en mémoire. */
  function servirLaTournee() {
    const jeu = creerJeuDeTerrain();
    const options = { urlApi, aujourdhui: () => JOUR_DE_TERRAIN };
    serveurApi.use(
      ...creerHandlersPlanning(jeu, options),
      ...creerHandlersInterventions(jeu, options),
    );
    return jeu;
  }

  async function etapes() {
    return within(await screen.findByRole('list')).getAllByRole('listitem');
  }

  it('propose dans chaque étape l’action de son statut, en zone tactile de 44 px', async () => {
    servirLaTournee();

    render(<PageMaTournee />);

    const [signee, sansSignature, enCours, planifiee] = await etapes();
    expect(within(planifiee).getByRole('button', { name: 'Démarrer' })).toHaveClass('h-11');
    expect(within(enCours).getByRole('button', { name: "Terminer l'intervention" })).toHaveClass(
      'h-11',
    );
    expect(
      within(sansSignature).getByRole('button', { name: 'Compléter le compte rendu' }),
    ).toHaveClass('h-11');
    expect(sansSignature).toHaveTextContent('Évier débouché.');
    expect(signee).toHaveTextContent('Signée par Josiane Baret à 08:20');
    expect(within(signee).queryByRole('button')).not.toBeInTheDocument();
  });

  it('RG33 : le compte rendu d’une intervention signée se lit sans pouvoir être modifié', async () => {
    servirLaTournee();

    render(<PageMaTournee />);

    const [signee] = await etapes();
    expect(signee).toHaveTextContent('Chaudière nettoyée.');
    expect(within(signee).queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      within(signee).queryByRole('button', { name: 'Compléter le compte rendu' }),
    ).not.toBeInTheDocument();
  });

  it('démarre l’intervention planifiée et recharge la tournée', async () => {
    servirLaTournee();
    const utilisateur = userEvent.setup();
    render(<PageMaTournee />);
    const planifiee = (await etapes())[3];

    await utilisateur.click(within(planifiee).getByRole('button', { name: 'Démarrer' }));

    const rechargee = (await screen.findAllByRole('button', { name: "Terminer l'intervention" }))
      .length;
    expect(rechargee).toBe(2);
    expect(within((await etapes())[3]).getByText('En cours')).toBeInTheDocument();
  });

  it('RG24 : affiche à côté du bouton le refus de l’API quand la tournée n’est pas celle du jour', async () => {
    servirLaTournee();
    const message =
      'Cette intervention est prévue le 2026-11-24 : elle ne peut être démarrée que ce jour-là.';
    serveurApi.use(
      http.post(urlApi('/interventions/:id/start'), () =>
        HttpResponse.json({ statusCode: 400, message }, { status: 400 }),
      ),
    );
    const utilisateur = userEvent.setup();
    render(<PageMaTournee />);
    const planifiee = (await etapes())[3];

    await utilisateur.click(within(planifiee).getByRole('button', { name: 'Démarrer' }));

    expect(await within(planifiee).findByRole('alert')).toHaveTextContent(message);
    expect(within(planifiee).getByRole('button', { name: 'Démarrer' })).toBeEnabled();
  });

  it('désactive « Démarrer » pendant la requête : un double appui n’envoie qu’une requête', async () => {
    servirLaTournee();
    const demarrages = vi.fn();
    let repondre: () => void = () => undefined;
    serveurApi.use(
      http.post(urlApi('/interventions/:id/start'), async () => {
        demarrages();
        await new Promise<void>((resolve) => (repondre = resolve));
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const utilisateur = userEvent.setup();
    render(<PageMaTournee />);
    const planifiee = (await etapes())[3];
    const bouton = within(planifiee).getByRole('button', { name: 'Démarrer' });

    await utilisateur.click(bouton);
    await utilisateur.click(bouton);

    expect(bouton).toBeDisabled();
    expect(bouton).toHaveTextContent('Démarrage en cours…');
    await vi.waitFor(() => expect(demarrages).toHaveBeenCalledTimes(1));
    repondre();
    expect(await within(planifiee).findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Réessayez plus tard.',
    );
    expect(demarrages).toHaveBeenCalledTimes(1);
  });

  it('ouvre la clôture de l’intervention en cours, puis recharge la tournée après la signature', async () => {
    servirLaTournee();
    simulerCanvas();
    const utilisateur = userEvent.setup();
    render(<PageMaTournee />);
    const enCours = (await etapes())[2];

    await utilisateur.click(
      within(enCours).getByRole('button', { name: "Terminer l'intervention" }),
    );
    const fenetre = screen.getByRole('dialog', { name: "Terminer l'intervention" });
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Terminer sans signature' }),
    );

    expect(
      await screen.findAllByRole('button', { name: 'Compléter le compte rendu' }),
    ).toHaveLength(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('US18 : complète le compte rendu, prérempli avec le texte actuel', async () => {
    servirLaTournee();
    const utilisateur = userEvent.setup();
    render(<PageMaTournee />);
    const sansSignature = (await etapes())[1];

    await utilisateur.click(
      within(sansSignature).getByRole('button', { name: 'Compléter le compte rendu' }),
    );
    const fenetre = screen.getByRole('dialog', { name: 'Compléter le compte rendu' });
    const champ = within(fenetre).getByLabelText('Compte rendu');
    expect(champ).toHaveValue('Évier débouché.');
    expect(champ).toHaveFocus();
    await utilisateur.type(champ, ' Siphon remplacé.');
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer le compte rendu' }),
    );

    expect(await screen.findByText('Évier débouché. Siphon remplacé.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('US18 : affiche le refus de l’API dans la fenêtre du compte rendu', async () => {
    servirLaTournee();
    serveurApi.use(
      http.patch(urlApi('/interventions/:id/report'), () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'Le compte rendu d’une intervention signée ne se modifie plus.',
          },
          { status: 400 },
        ),
      ),
    );
    const utilisateur = userEvent.setup();
    render(<PageMaTournee />);
    const sansSignature = (await etapes())[1];

    await utilisateur.click(
      within(sansSignature).getByRole('button', { name: 'Compléter le compte rendu' }),
    );
    const fenetre = screen.getByRole('dialog', { name: 'Compléter le compte rendu' });
    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Enregistrer le compte rendu' }),
    );

    expect(await within(fenetre).findByRole('alert')).toHaveTextContent(
      'Le compte rendu d’une intervention signée ne se modifie plus.',
    );
  });
});
