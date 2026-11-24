import { Injectable } from '@nestjs/common';
import type { Role } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.js';

/** Compte lu pour la connexion : seule lecture du hash du mot de passe dans toute l'API. */
export interface CompteAvecMotDePasse {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  actif: boolean;
  mdpAChanger: boolean;
  motDePasseHash: string;
}

/** Jeton de rafraîchissement retrouvé par son empreinte, avec l'état du compte. */
export interface JetonStocke {
  id: number;
  idUtilisateur: number;
  expireLe: Date;
  revoqueLe: Date | null;
  compte: { role: Role; actif: boolean };
}

const CHAMPS_CONNEXION = {
  id: true,
  email: true,
  nom: true,
  prenom: true,
  role: true,
  actif: true,
  mdpAChanger: true,
  motDePasseHash: true,
} as const;

/** Accès aux comptes et aux jetons de rafraîchissement, pour l'authentification. */
@Injectable()
export class AuthentificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** L'e-mail est comparé en minuscules : il est toujours enregistré ainsi. */
  trouverCompteParEmail(email: string): Promise<CompteAvecMotDePasse | null> {
    return this.prisma.utilisateur.findUnique({
      where: { email: email.toLowerCase() },
      select: CHAMPS_CONNEXION,
    });
  }

  async enregistrerConnexion(idUtilisateur: number, le: Date): Promise<void> {
    await this.prisma.utilisateur.update({
      where: { id: idUtilisateur },
      data: { derniereConnexion: le },
    });
  }

  async creerJetonRafraichissement(
    idUtilisateur: number,
    hashJeton: string,
    expireLe: Date,
  ): Promise<void> {
    await this.prisma.jetonRafraichissement.create({
      data: { idUtilisateur, hashJeton, expireLe },
    });
  }

  async trouverJetonRafraichissement(hashJeton: string): Promise<JetonStocke | null> {
    const jeton = await this.prisma.jetonRafraichissement.findUnique({
      where: { hashJeton },
      select: {
        id: true,
        idUtilisateur: true,
        expireLe: true,
        revoqueLe: true,
        utilisateur: { select: { role: true, actif: true } },
      },
    });
    return jeton === null ? null : { ...jeton, compte: jeton.utilisateur };
  }

  /**
   * Rotation, dans une transaction : l'ancien jeton n'est révoqué que s'il ne l'était pas encore.
   * Si deux requêtes présentent le même jeton au même instant, une seule le remplace ;
   * l'autre reçoit false et le service répond 401.
   */
  remplacerJetonRafraichissement(
    idAncienJeton: number,
    nouveau: { idUtilisateur: number; hashJeton: string; expireLe: Date },
    le: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const revoques = await transaction.jetonRafraichissement.updateMany({
        where: { id: idAncienJeton, revoqueLe: null },
        data: { revoqueLe: le },
      });
      if (revoques.count === 0) {
        return false;
      }
      await transaction.jetonRafraichissement.create({ data: nouveau });
      return true;
    });
  }

  /** Déconnexion : révoque le jeton de la session courante, s'il est encore actif. */
  async revoquerJetonRafraichissement(hashJeton: string, le: Date): Promise<void> {
    await this.prisma.jetonRafraichissement.updateMany({
      where: { hashJeton, revoqueLe: null },
      data: { revoqueLe: le },
    });
  }

  /** Toutes les sessions du compte : vol détecté, nouveau mot de passe, compte désactivé. */
  async revoquerTousLesJetons(idUtilisateur: number, le: Date): Promise<void> {
    await this.prisma.jetonRafraichissement.updateMany({
      where: { idUtilisateur, revoqueLe: null },
      data: { revoqueLe: le },
    });
  }
}
