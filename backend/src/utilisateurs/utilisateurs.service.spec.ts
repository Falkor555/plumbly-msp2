import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { hacherMotDePasse, verifierMotDePasse } from '../authentification/mots-de-passe.js';
import type { Horloge } from '../commun/horloge.js';
import type { UtilisateursRepository } from './utilisateurs.repository.js';
import { UtilisateursService } from './utilisateurs.service.js';
import type { UtilisateurApi } from './utilisateurs.types.js';

const MAINTENANT = new Date('2026-12-08T08:00:00+04:00');
const ANCIEN = 'Ancien#MotDePasse1';
const NOUVEAU = 'Nouveau#MotDePasse2';

const SOPHIE: UtilisateurApi = {
  id: 3,
  email: 'sophie.martin@plomberie-durand.fr',
  nom: 'Martin',
  prenom: 'Sophie',
  role: 'GESTIONNAIRE',
  actif: true,
  mdpAChanger: true,
  derniereConnexion: null,
  creeLe: new Date('2026-11-20T06:00:00Z'),
};

let empreinteAncien: string;
beforeAll(async () => {
  empreinteAncien = await hacherMotDePasse(ANCIEN);
});

function creerService(remplacements: Record<string, unknown> = {}) {
  const depot = {
    trouverUtilisateur: vi.fn().mockResolvedValue(SOPHIE),
    modifierUtilisateur: vi.fn().mockResolvedValue({ ...SOPHIE, nom: 'Martin-Hoarau' }),
    lireEmpreinte: vi.fn().mockResolvedValue(empreinteAncien),
    changerMotDePasse: vi.fn().mockResolvedValue(undefined),
    ...remplacements,
  };
  const horloge = { maintenant: () => MAINTENANT } as Horloge;
  return {
    service: new UtilisateursService(depot as unknown as UtilisateursRepository, horloge),
    depot,
  };
}

describe('profil (US05)', () => {
  it('renvoie le profil de l’utilisateur connecté', async () => {
    const { service, depot } = creerService();
    await expect(service.consulterMonProfil(3)).resolves.toEqual(SOPHIE);
    expect(depot.trouverUtilisateur).toHaveBeenCalledWith(3);
  });

  it('répond 404 si le compte n’existe plus', async () => {
    const { service } = creerService({ trouverUtilisateur: vi.fn().mockResolvedValue(null) });
    await expect(service.consulterMonProfil(3)).rejects.toThrow(NotFoundException);
  });

  it('modifie le nom', async () => {
    const { service, depot } = creerService();
    const modifie = await service.modifierMonProfil(3, { nom: 'Martin-Hoarau' });
    expect(modifie.nom).toBe('Martin-Hoarau');
    expect(depot.modifierUtilisateur).toHaveBeenCalledWith(3, { nom: 'Martin-Hoarau' });
  });
});

describe('changement de mot de passe (US03, US05)', () => {
  it('enregistre l’empreinte du nouveau mot de passe et coupe les sessions', async () => {
    const { service, depot } = creerService();

    await service.changerMonMotDePasse(3, { ancienMotDePasse: ANCIEN, nouveauMotDePasse: NOUVEAU });

    const [id, empreinte, le] = depot.changerMotDePasse.mock.calls[0] as [number, string, Date];
    expect(id).toBe(3);
    expect(le).toBe(MAINTENANT);
    expect(await verifierMotDePasse(NOUVEAU, empreinte)).toBe(true);
  });

  it('refuse un ancien mot de passe faux avec un 400', async () => {
    const { service, depot } = creerService();
    await expect(
      service.changerMonMotDePasse(3, {
        ancienMotDePasse: 'Faux#MotDePasse3',
        nouveauMotDePasse: NOUVEAU,
      }),
    ).rejects.toThrow(new BadRequestException(['ancienMotDePasse est incorrect']));
    expect(depot.changerMotDePasse).not.toHaveBeenCalled();
  });
});

describe('administration des comptes (US03)', () => {
  const ADMIN = { id: 1, role: 'ADMIN' as const };
  const KEVIN: UtilisateurApi = { ...SOPHIE, id: 7, role: 'TECHNICIEN' };
  const NOUVEL = {
    email: 'julie.roche@plumbly.test',
    nom: 'Roche',
    prenom: 'Julie',
    role: 'TECHNICIEN' as const,
  };

  it('crée un compte avec un mot de passe provisoire dont seule l’empreinte est stockée', async () => {
    const creerUtilisateur = vi.fn().mockResolvedValue({ ...SOPHIE, id: 12 });
    const { service } = creerService({ creerUtilisateur });

    const { motDePasseProvisoire } = await service.creer(NOUVEL);

    const [donnees, empreinte] = creerUtilisateur.mock.calls[0] as [unknown, string];
    expect(donnees).toEqual(NOUVEL);
    expect(empreinte).not.toContain(motDePasseProvisoire);
    expect(await verifierMotDePasse(motDePasseProvisoire, empreinte)).toBe(true);
  });

  it('répond 409 si l’e-mail est déjà utilisé', async () => {
    const { service } = creerService({ creerUtilisateur: vi.fn().mockResolvedValue(null) });
    await expect(service.creer(NOUVEL)).rejects.toThrow(ConflictException);
  });

  it('répond 404 pour un compte inexistant', async () => {
    const { service } = creerService({ trouverUtilisateur: vi.fn().mockResolvedValue(null) });
    await expect(service.consulter(99)).rejects.toThrow(NotFoundException);
  });

  it('interdit à un administrateur de retirer son propre rôle', async () => {
    const { service } = creerService({
      trouverUtilisateur: vi.fn().mockResolvedValue({ ...SOPHIE, id: 1, role: 'ADMIN' }),
    });
    await expect(service.modifier(1, { role: 'GESTIONNAIRE' }, ADMIN)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse de changer le rôle d’un technicien qui a une fiche', async () => {
    const modifierCompte = vi.fn();
    const { service } = creerService({
      trouverUtilisateur: vi.fn().mockResolvedValue(KEVIN),
      aUneFicheTechnicien: vi.fn().mockResolvedValue(true),
      modifierCompte,
    });
    await expect(service.modifier(7, { role: 'GESTIONNAIRE' }, ADMIN)).rejects.toThrow(
      ConflictException,
    );
    expect(modifierCompte).not.toHaveBeenCalled();
  });

  it('répond 409 si le nouvel e-mail appartient à un autre compte', async () => {
    const { service } = creerService({ modifierCompte: vi.fn().mockResolvedValue(null) });
    await expect(service.modifier(3, { email: 'pris@plumbly.test' }, ADMIN)).rejects.toThrow(
      ConflictException,
    );
  });

  it('interdit à un administrateur de désactiver son propre compte', async () => {
    const { service } = creerService();
    await expect(service.desactiver(1, ADMIN)).rejects.toThrow(BadRequestException);
  });

  it('désactive un autre compte et coupe ses sessions', async () => {
    const desactiver = vi.fn().mockResolvedValue({ ...KEVIN, actif: false });
    const { service } = creerService({ desactiver });
    const desactive = await service.desactiver(7, ADMIN);
    expect(desactive.actif).toBe(false);
    expect(desactiver).toHaveBeenCalledWith(7, MAINTENANT);
  });
});
