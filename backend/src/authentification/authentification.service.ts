import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Horloge } from '../commun/horloge.js';
import type { Role } from '../generated/prisma/client.ts';
import {
  AuthentificationRepository,
  type CompteAvecMotDePasse,
} from './authentification.repository.js';
import type {
  IdentifiantsConnexion,
  ReponseConnexion,
  ReponseRafraichissement,
  Session,
  UtilisateurConnecteApi,
} from './authentification.types.js';
import {
  type ContenuJetonAcces,
  DUREE_JETON_ACCES_SECONDES,
  DUREE_JETON_RAFRAICHISSEMENT_MS,
  genererJetonRafraichissement,
  hacherJeton,
} from './jetons.js';
import { simulerVerification, verifierMotDePasse } from './mots-de-passe.js';

const IDENTIFIANTS_INCORRECTS = 'E-mail ou mot de passe incorrect.';
const SESSION_INVALIDE = 'Session expirée : se reconnecter.';

/**
 * Connexion, rafraîchissement et déconnexion (contrat d'API, 6.1 ; ADR 0007).
 * Ne connaît ni HTTP ni les cookies : le contrôleur s'en charge.
 */
@Injectable()
export class AuthentificationService {
  constructor(
    private readonly depot: AuthentificationRepository,
    private readonly jwt: JwtService,
    private readonly horloge: Horloge,
  ) {}

  /** US01. Même réponse, et même durée, pour un e-mail inconnu, un mot de passe faux ou un compte désactivé. */
  async connecter({
    email,
    motDePasse,
  }: IdentifiantsConnexion): Promise<Session<ReponseConnexion>> {
    const compte = await this.depot.trouverCompteParEmail(email);
    if (compte === null) {
      await simulerVerification(motDePasse);
      throw new UnauthorizedException(IDENTIFIANTS_INCORRECTS);
    }
    // Le compte désactivé n'est refusé qu'après le calcul argon2 : la durée ne le trahit pas.
    const motDePasseValide = await verifierMotDePasse(motDePasse, compte.motDePasseHash);
    if (!motDePasseValide || !compte.actif) {
      throw new UnauthorizedException(IDENTIFIANTS_INCORRECTS);
    }
    const maintenant = this.horloge.maintenant();
    await this.depot.enregistrerConnexion(compte.id, maintenant);
    const jetonRafraichissement = await this.ouvrirSession(compte.id, maintenant);
    return {
      reponse: {
        accessToken: await this.signer(compte.id, compte.role),
        expiresIn: DUREE_JETON_ACCES_SECONDES,
        utilisateur: versUtilisateurConnecteApi(compte),
      },
      jetonRafraichissement,
    };
  }

  /** Rotation : chaque jeton de rafraîchissement ne sert qu'une fois. */
  async rafraichir(jeton: string | undefined): Promise<Session<ReponseRafraichissement>> {
    if (jeton === undefined || jeton === '') {
      throw new UnauthorizedException(SESSION_INVALIDE);
    }
    const maintenant = this.horloge.maintenant();
    const stocke = await this.depot.trouverJetonRafraichissement(hacherJeton(jeton));
    if (stocke === null) {
      throw new UnauthorizedException(SESSION_INVALIDE);
    }
    if (stocke.revoqueLe !== null) {
      // Un jeton déjà remplacé est présenté à nouveau : il a été copié. Toutes les sessions
      // du compte sont coupées, celle du voleur comme celle de l'utilisateur légitime.
      await this.depot.revoquerTousLesJetons(stocke.idUtilisateur, maintenant);
      throw new UnauthorizedException(SESSION_INVALIDE);
    }
    if (stocke.expireLe <= maintenant || !stocke.compte.actif) {
      throw new UnauthorizedException(SESSION_INVALIDE);
    }
    const nouveau = genererJetonRafraichissement();
    const remplace = await this.depot.remplacerJetonRafraichissement(
      stocke.id,
      {
        idUtilisateur: stocke.idUtilisateur,
        hashJeton: nouveau.hashJeton,
        expireLe: expiration(maintenant),
      },
      maintenant,
    );
    if (!remplace) {
      // Une autre requête a utilisé ce jeton au même instant : elle seule obtient la suite.
      throw new UnauthorizedException(SESSION_INVALIDE);
    }
    return {
      reponse: {
        accessToken: await this.signer(stocke.idUtilisateur, stocke.compte.role),
        expiresIn: DUREE_JETON_ACCES_SECONDES,
      },
      jetonRafraichissement: nouveau.jeton,
    };
  }

  /** US02 : révoque le jeton de la session courante, s'il y en a un. */
  async deconnecter(jeton: string | undefined): Promise<void> {
    if (jeton !== undefined && jeton !== '') {
      await this.depot.revoquerJetonRafraichissement(hacherJeton(jeton), this.horloge.maintenant());
    }
  }

  private async ouvrirSession(idUtilisateur: number, maintenant: Date): Promise<string> {
    const { jeton, hashJeton } = genererJetonRafraichissement();
    await this.depot.creerJetonRafraichissement(idUtilisateur, hashJeton, expiration(maintenant));
    return jeton;
  }

  private signer(id: number, role: Role): Promise<string> {
    const contenu: ContenuJetonAcces = { sub: id, role };
    return this.jwt.signAsync(contenu);
  }
}

function expiration(maintenant: Date): Date {
  return new Date(maintenant.getTime() + DUREE_JETON_RAFRAICHISSEMENT_MS);
}

/** Tout sauf le hash du mot de passe. */
function versUtilisateurConnecteApi({
  id,
  email,
  nom,
  prenom,
  role,
  mdpAChanger,
}: CompteAvecMotDePasse): UtilisateurConnecteApi {
  return { id, email, nom, prenom, role, mdpAChanger };
}
