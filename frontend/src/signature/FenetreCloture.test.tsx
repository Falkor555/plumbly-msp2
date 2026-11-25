import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Intervention } from '../api/types';
import { creerHandlersInterventions } from '../simulation/handlersInterventions';
import { IMAGE_PNG_DE_TEST, simulerCanvas } from '../test/canvas';
import { creerJeuDeTerrain, JOUR_DE_TERRAIN } from '../test/jeuDeTerrain';
import { serveurApi, urlApi } from '../test/msw/serveur';
import { FenetreCloture } from './FenetreCloture';

interface RequeteEnvoyee {
  methode: string;
  chemin: string;
  corps: unknown;
}

let ecritures: RequeteEnvoyee[];
let enCours: Intervention;

beforeEach(() => {
  const jeu = creerJeuDeTerrain();
  enCours = jeu.techniciens[0].tournees[0].interventions[2];
  ecritures = [];
  serveurApi.use(...creerHandlersInterventions(jeu, { urlApi, aujourdhui: () => JOUR_DE_TERRAIN }));
  serveurApi.events.on('request:start', async ({ request }) => {
    if (request.method === 'GET') return;
    const texte = await request.clone().text();
    ecritures.push({
      methode: request.method,
      chemin: new URL(request.url).pathname.replace('/api/v1', ''),
      corps: texte ? JSON.parse(texte) : undefined,
    });
  });
  return () => serveurApi.events.removeAllListeners();
});

function ouvrir() {
  const utilisateur = userEvent.setup();
  const onFermer = vi.fn();
  render(<FenetreCloture intervention={enCours} onFermer={onFermer} />);
  const fenetre = screen.getByRole('dialog', { name: "Terminer l'intervention" });
  const boutonSigner = within(fenetre).getByRole('button', { name: 'Faire signer et terminer' });
  return { utilisateur, onFermer, fenetre, boutonSigner };
}

function signer(fenetre: HTMLElement) {
  const zone = within(fenetre).getByRole('img', { name: 'Zone de signature du client' });
  fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(zone, { pointerId: 1, clientX: 80, clientY: 40 });
  fireEvent.pointerUp(zone, { pointerId: 1 });
}

describe('fenêtre de clôture (US17, US18, US33)', () => {
  it('récapitule l’intervention et propose le nom du client comme signataire', () => {
    simulerCanvas();

    const { fenetre } = ouvrir();

    expect(fenetre).toHaveTextContent('Mme Grondin');
    expect(fenetre).toHaveTextContent('3 rue des Flamboyants, 97400 Saint-Denis');
    expect(fenetre).toHaveTextContent('Remplacement de robinet');
    expect(fenetre).toHaveTextContent('Démarréeà 10:35');
    expect(within(fenetre).getByLabelText('Nom du signataire')).toHaveValue('Mme Grondin');
    expect(fenetre).toHaveTextContent(
      "En signant, je confirme que l'intervention décrite ci-dessus a été réalisée.",
    );
    expect(within(fenetre).getByRole('button', { name: 'Fermer' })).toHaveFocus();
  });

  it('compte les caractères du compte rendu sur 2 000', async () => {
    simulerCanvas();
    const { utilisateur, fenetre } = ouvrir();

    await utilisateur.type(within(fenetre).getByLabelText('Compte rendu'), 'Joint changé');

    expect(fenetre).toHaveTextContent('12 / 2 000 caractères');
    expect(within(fenetre).getByLabelText('Compte rendu')).toHaveAttribute('maxlength', '2000');
    expect(within(fenetre).getByLabelText('Nom du signataire')).toHaveAttribute('maxlength', '100');
  });

  describe('« Faire signer et terminer » bloqué, avec la raison affichée (RG31)', () => {
    it('sans tracé', async () => {
      simulerCanvas();
      const { utilisateur, fenetre, boutonSigner } = ouvrir();

      await utilisateur.type(within(fenetre).getByLabelText('Compte rendu'), 'Joint changé');

      expect(boutonSigner).toBeDisabled();
      expect(boutonSigner).toHaveAccessibleDescription('Faites signer le client dans le cadre.');
    });

    it('sans compte rendu', () => {
      simulerCanvas();
      const { fenetre, boutonSigner } = ouvrir();

      signer(fenetre);

      expect(boutonSigner).toBeDisabled();
      expect(boutonSigner).toHaveAccessibleDescription('Saisissez le compte rendu.');
    });

    it('sans nom du signataire', async () => {
      simulerCanvas();
      const { utilisateur, fenetre, boutonSigner } = ouvrir();
      signer(fenetre);
      await utilisateur.type(within(fenetre).getByLabelText('Compte rendu'), 'Joint changé');

      await utilisateur.clear(within(fenetre).getByLabelText('Nom du signataire'));

      expect(boutonSigner).toBeDisabled();
      expect(boutonSigner).toHaveAccessibleDescription('Indiquez le nom du signataire.');
    });
  });

  it('envoie la clôture et la signature dans une seule requête, puis se ferme', async () => {
    simulerCanvas();
    const { utilisateur, onFermer, fenetre, boutonSigner } = ouvrir();
    await utilisateur.type(within(fenetre).getByLabelText('Compte rendu'), '  Joint changé  ');
    await utilisateur.clear(within(fenetre).getByLabelText('Nom du signataire'));
    await utilisateur.type(within(fenetre).getByLabelText('Nom du signataire'), 'M. Grondin fils');
    signer(fenetre);

    await utilisateur.click(boutonSigner);

    await vi.waitFor(() => expect(onFermer).toHaveBeenCalledWith(true));
    expect(ecritures).toEqual([
      {
        methode: 'POST',
        chemin: '/interventions/3/complete',
        corps: {
          compteRendu: 'Joint changé',
          signature: { image: IMAGE_PNG_DE_TEST, nomSignataire: 'M. Grondin fils' },
        },
      },
    ]);
  });

  it('« Terminer sans signature » n’envoie que le compte rendu saisi', async () => {
    simulerCanvas();
    const { utilisateur, onFermer, fenetre } = ouvrir();
    await utilisateur.type(within(fenetre).getByLabelText('Compte rendu'), 'Client absent.');
    signer(fenetre);

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Terminer sans signature' }),
    );

    await vi.waitFor(() => expect(onFermer).toHaveBeenCalledWith(true));
    expect(ecritures).toEqual([
      {
        methode: 'POST',
        chemin: '/interventions/3/complete',
        corps: { compteRendu: 'Client absent.' },
      },
    ]);
  });

  it('« Terminer sans signature » sans compte rendu envoie un corps vide', async () => {
    simulerCanvas();
    const { utilisateur, onFermer, fenetre } = ouvrir();

    await utilisateur.click(
      within(fenetre).getByRole('button', { name: 'Terminer sans signature' }),
    );

    await vi.waitFor(() => expect(onFermer).toHaveBeenCalledWith(true));
    expect(ecritures).toEqual([
      { methode: 'POST', chemin: '/interventions/3/complete', corps: {} },
    ]);
  });

  it('affiche le refus de l’API et garde la fenêtre ouverte pour un nouvel essai', async () => {
    simulerCanvas();
    serveurApi.use(
      http.post(
        urlApi('/interventions/:id/complete'),
        () =>
          HttpResponse.json(
            { statusCode: 400, message: ['La signature doit être une image PNG valide.'] },
            { status: 400 },
          ),
        { once: true },
      ),
    );
    const { utilisateur, onFermer, fenetre, boutonSigner } = ouvrir();
    await utilisateur.type(within(fenetre).getByLabelText('Compte rendu'), 'Joint changé');
    signer(fenetre);

    await utilisateur.click(boutonSigner);

    expect(await within(fenetre).findByRole('alert')).toHaveTextContent(
      'La signature doit être une image PNG valide.',
    );
    expect(onFermer).not.toHaveBeenCalled();
    expect(boutonSigner).toBeEnabled();
  });

  it('refuse une image de plus de 48 Ko avant l’envoi', async () => {
    simulerCanvas(`data:image/png;base64,${'A'.repeat(65_540)}`);
    const { utilisateur, onFermer, fenetre, boutonSigner } = ouvrir();
    await utilisateur.type(within(fenetre).getByLabelText('Compte rendu'), 'Joint changé');
    signer(fenetre);

    await utilisateur.click(boutonSigner);

    expect(within(fenetre).getByRole('alert')).toHaveTextContent(
      'La signature est trop lourde (plus de 48 Ko).',
    );
    expect(ecritures).toEqual([]);
    expect(onFermer).not.toHaveBeenCalled();
  });

  it('désactive les boutons pendant l’envoi : un double appui n’envoie qu’une requête', async () => {
    simulerCanvas();
    let repondre: () => void = () => undefined;
    serveurApi.use(
      http.post(urlApi('/interventions/:id/complete'), async () => {
        await new Promise<void>((resolve) => (repondre = resolve));
        return HttpResponse.json(enCours);
      }),
    );
    const { utilisateur, onFermer, fenetre, boutonSigner } = ouvrir();
    await utilisateur.type(within(fenetre).getByLabelText('Compte rendu'), 'Joint changé');
    signer(fenetre);

    await utilisateur.click(boutonSigner);
    await utilisateur.click(boutonSigner);

    expect(boutonSigner).toHaveTextContent('Signature en cours…');
    expect(boutonSigner).toBeDisabled();
    expect(within(fenetre).getByRole('button', { name: 'Terminer sans signature' })).toBeDisabled();
    expect(within(fenetre).getByRole('button', { name: 'Fermer' })).toBeDisabled();
    await vi.waitFor(() => expect(ecritures).toHaveLength(1));
    repondre();
    await vi.waitFor(() => expect(onFermer).toHaveBeenCalledWith(true));
    expect(ecritures).toHaveLength(1);
  });

  describe('une saisie ne se perd pas par erreur', () => {
    it('Échap ferme la fenêtre tant que rien n’a été saisi', async () => {
      simulerCanvas();
      const { utilisateur, onFermer } = ouvrir();

      await utilisateur.keyboard('{Escape}');

      expect(onFermer).toHaveBeenCalledWith(false);
    });

    it.each([
      ['un tracé', (fenetre: HTMLElement) => Promise.resolve(signer(fenetre))],
      [
        'un compte rendu',
        (fenetre: HTMLElement) =>
          userEvent.type(within(fenetre).getByLabelText('Compte rendu'), 'Joint'),
      ],
      [
        'un autre nom',
        (fenetre: HTMLElement) =>
          userEvent.type(within(fenetre).getByLabelText('Nom du signataire'), ' fils'),
      ],
    ])('Échap ne ferme plus après %s : seul « Fermer » ferme', async (_cas, saisir) => {
      simulerCanvas();
      const { utilisateur, onFermer, fenetre } = ouvrir();
      await saisir(fenetre);

      await utilisateur.keyboard('{Escape}');
      expect(onFermer).not.toHaveBeenCalled();

      await utilisateur.click(within(fenetre).getByRole('button', { name: 'Fermer' }));
      expect(onFermer).toHaveBeenCalledWith(false);
    });

    it('un clic sur le voile ne ferme pas la fenêtre', async () => {
      simulerCanvas();
      const { utilisateur, onFermer, fenetre } = ouvrir();

      await utilisateur.click(fenetre.parentElement as HTMLElement);

      expect(onFermer).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
