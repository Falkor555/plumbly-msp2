import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Horloge } from '../commun/horloge.js';
import type {
  AuthentificationRepository,
  CompteAvecMotDePasse,
  JetonStocke,
} from './authentification.repository.js';
import { AuthentificationService } from './authentification.service.js';
import { DUREE_JETON_RAFRAICHISSEMENT_MS, hacherJeton } from './jetons.js';
import { hacherMotDePasse } from './mots-de-passe.js';

const MAINTENANT = new Date('2026-12-08T08:00:00+04:00');
const MOT_DE_PASSE = 'Plombier#2026!';
const jwt = new JwtService({
  secret: 'secret-des-tests-unitaires-de-32-caracteres-au-moins',
  signOptions: { algorithm: 'HS256', expiresIn: 900 },
  verifyOptions: { algorithms: ['HS256'] },
});
const horloge = { maintenant: () => MAINTENANT } as Horloge;

let empreinte: string;
beforeAll(async () => {
  empreinte = await hacherMotDePasse(MOT_DE_PASSE);
});

function compte(modification: Partial<CompteAvecMotDePasse> = {}): CompteAvecMotDePasse {
  return {
    id: 3,
    email: 'sophie.martin@plomberie-durand.fr',
    nom: 'Martin',
    prenom: 'Sophie',
    role: 'GESTIONNAIRE',
    actif: true,
    mdpAChanger: false,
    motDePasseHash: empreinte,
    ...modification,
  };
}

function jetonStocke(modification: Partial<JetonStocke> = {}): JetonStocke {
  return {
    id: 10,
    idUtilisateur: 3,
    expireLe: new Date(MAINTENANT.getTime() + 3_600_000),
    revoqueLe: null,
    compte: { role: 'GESTIONNAIRE', actif: true },
    ...modification,
  };
}

function creerService(remplacements: Record<string, unknown> = {}) {
  const depot = {
    trouverCompteParEmail: vi.fn().mockResolvedValue(null),
    enregistrerConnexion: vi.fn().mockResolvedValue(undefined),
    creerJetonRafraichissement: vi.fn().mockResolvedValue(undefined),
    trouverJetonRafraichissement: vi.fn().mockResolvedValue(null),
    remplacerJetonRafraichissement: vi.fn().mockResolvedValue(true),
    revoquerJetonRafraichissement: vi.fn().mockResolvedValue(undefined),
    revoquerTousLesJetons: vi.fn().mockResolvedValue(undefined),
    ...remplacements,
  };
  const service = new AuthentificationService(
    depot as unknown as AuthentificationRepository,
    jwt,
    horloge,
  );
  return { service, depot };
}

describe('connexion (US01)', () => {
  it('ouvre une session avec un jeton d’accès signé et un jeton de rafraîchissement', async () => {
    const { service, depot } = creerService({
      trouverCompteParEmail: vi.fn().mockResolvedValue(compte()),
    });

    const session = await service.connecter({ email: compte().email, motDePasse: MOT_DE_PASSE });

    expect(await jwt.verifyAsync(session.reponse.accessToken)).toMatchObject({
      sub: 3,
      role: 'GESTIONNAIRE',
    });
    expect(session.reponse.expiresIn).toBe(900);
    expect(session.reponse.utilisateur).not.toHaveProperty('motDePasseHash');
    expect(depot.enregistrerConnexion).toHaveBeenCalledWith(3, MAINTENANT);
    expect(depot.creerJetonRafraichissement).toHaveBeenCalledWith(
      3,
      hacherJeton(session.jetonRafraichissement),
      new Date(MAINTENANT.getTime() + DUREE_JETON_RAFRAICHISSEMENT_MS),
    );
  });

  it.each([
    ['un mot de passe faux', compte(), 'Mauvais#Mot2Passe'],
    ['un e-mail inconnu', null, MOT_DE_PASSE],
  ])('refuse %s avec le message générique', async (_cas, trouve, motDePasse) => {
    const { service, depot } = creerService({
      trouverCompteParEmail: vi.fn().mockResolvedValue(trouve === null ? null : compte()),
    });
    await expect(service.connecter({ email: 'x@exemple.fr', motDePasse })).rejects.toThrow(
      new UnauthorizedException('E-mail ou mot de passe incorrect.'),
    );
    expect(depot.creerJetonRafraichissement).not.toHaveBeenCalled();
  });

  it('refuse un compte désactivé avec le même message', async () => {
    const { service } = creerService({
      trouverCompteParEmail: vi.fn().mockResolvedValue(compte({ actif: false })),
    });
    await expect(
      service.connecter({ email: compte().email, motDePasse: MOT_DE_PASSE }),
    ).rejects.toThrow(new UnauthorizedException('E-mail ou mot de passe incorrect.'));
  });
});

describe('rafraîchissement', () => {
  it('remplace le jeton par un nouveau (rotation)', async () => {
    const { service, depot } = creerService({
      trouverJetonRafraichissement: vi.fn().mockResolvedValue(jetonStocke()),
    });

    const session = await service.rafraichir('ancien-jeton');

    expect(session.jetonRafraichissement).not.toBe('ancien-jeton');
    expect(depot.trouverJetonRafraichissement).toHaveBeenCalledWith(hacherJeton('ancien-jeton'));
    expect(depot.remplacerJetonRafraichissement).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        idUtilisateur: 3,
        hashJeton: hacherJeton(session.jetonRafraichissement),
      }),
      MAINTENANT,
    );
    expect(await jwt.verifyAsync(session.reponse.accessToken)).toMatchObject({ sub: 3 });
  });

  it('coupe toutes les sessions si un jeton déjà remplacé revient (vol probable)', async () => {
    const { service, depot } = creerService({
      trouverJetonRafraichissement: vi
        .fn()
        .mockResolvedValue(jetonStocke({ revoqueLe: MAINTENANT })),
    });
    await expect(service.rafraichir('jeton-copie')).rejects.toThrow(UnauthorizedException);
    expect(depot.revoquerTousLesJetons).toHaveBeenCalledWith(3, MAINTENANT);
    expect(depot.remplacerJetonRafraichissement).not.toHaveBeenCalled();
  });

  it.each([
    ['sans cookie', undefined, null],
    ['un jeton inconnu', 'inconnu', null],
    ['un jeton expiré', 'expire', jetonStocke({ expireLe: MAINTENANT })],
    [
      'un compte désactivé',
      'desactive',
      jetonStocke({ compte: { role: 'GESTIONNAIRE', actif: false } }),
    ],
  ])('refuse %s', async (_cas, jeton, trouve) => {
    const { service, depot } = creerService({
      trouverJetonRafraichissement: vi.fn().mockResolvedValue(trouve),
    });
    await expect(service.rafraichir(jeton)).rejects.toThrow(UnauthorizedException);
    expect(depot.remplacerJetonRafraichissement).not.toHaveBeenCalled();
  });

  it('refuse si une autre requête a déjà utilisé le jeton au même instant', async () => {
    const { service } = creerService({
      trouverJetonRafraichissement: vi.fn().mockResolvedValue(jetonStocke()),
      remplacerJetonRafraichissement: vi.fn().mockResolvedValue(false),
    });
    await expect(service.rafraichir('jeton')).rejects.toThrow(UnauthorizedException);
  });
});

describe('déconnexion (US02)', () => {
  it('révoque le jeton de la session', async () => {
    const { service, depot } = creerService();
    await service.deconnecter('jeton-de-session');
    expect(depot.revoquerJetonRafraichissement).toHaveBeenCalledWith(
      hacherJeton('jeton-de-session'),
      MAINTENANT,
    );
  });

  it('ne fait rien sans cookie', async () => {
    const { service, depot } = creerService();
    await service.deconnecter(undefined);
    expect(depot.revoquerJetonRafraichissement).not.toHaveBeenCalled();
  });
});
