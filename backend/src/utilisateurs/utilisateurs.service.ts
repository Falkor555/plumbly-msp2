import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  genererMotDePasseProvisoire,
  hacherMotDePasse,
  verifierMotDePasse,
} from '../authentification/mots-de-passe.js';
import type { UtilisateurConnecte } from '../commun/autorisation/utilisateur-connecte.js';
import { Horloge } from '../commun/horloge.js';
import { type PageApi, paginer } from '../commun/validation.js';
import { UtilisateursRepository } from './utilisateurs.repository.js';
import type {
  ChangementMotDePasse,
  CompteCree,
  FiltresUtilisateurs,
  ModificationProfil,
  ModificationUtilisateur,
  NouvelUtilisateur,
  UtilisateurApi,
} from './utilisateurs.types.js';

const EMAIL_DEJA_UTILISE = 'Cet e-mail est déjà utilisé par un autre compte.';

/** Comptes utilisateurs (contrat d'API, 6.2). */
@Injectable()
export class UtilisateursService {
  constructor(
    private readonly depot: UtilisateursRepository,
    private readonly horloge: Horloge,
  ) {}

  // ---------- Son propre compte ----------

  /** US01, US05 */
  consulterMonProfil(id: number): Promise<UtilisateurApi> {
    return this.trouver(id);
  }

  /** US05 */
  async modifierMonProfil(id: number, modification: ModificationProfil): Promise<UtilisateurApi> {
    await this.trouver(id);
    return this.depot.modifierUtilisateur(id, modification);
  }

  /**
   * US03, US05. Toutes les sessions sont coupées, la session en cours comprise : si le mot
   * de passe avait fuité, l'éventuel attaquant perd aussi sa session.
   */
  async changerMonMotDePasse(
    id: number,
    { ancienMotDePasse, nouveauMotDePasse }: ChangementMotDePasse,
  ): Promise<void> {
    const empreinte = await this.depot.lireEmpreinte(id);
    if (empreinte === null) {
      throw new NotFoundException('Compte introuvable.');
    }
    if (!(await verifierMotDePasse(ancienMotDePasse, empreinte))) {
      // 400 et non 401 : le front prendrait un 401 pour une session expirée et déconnecterait.
      throw new BadRequestException(['ancienMotDePasse est incorrect']);
    }
    const nouvelleEmpreinte = await hacherMotDePasse(nouveauMotDePasse);
    await this.depot.changerMotDePasse(id, nouvelleEmpreinte, this.horloge.maintenant());
  }

  // ---------- Administration des comptes (US03) ----------

  async lister(filtres: FiltresUtilisateurs): Promise<PageApi<UtilisateurApi>> {
    const { utilisateurs, total } = await this.depot.rechercher(filtres);
    return paginer(utilisateurs, total, filtres);
  }

  /**
   * Le mot de passe provisoire est généré par le serveur, conforme à la politique, et renvoyé
   * une seule fois : seule son empreinte est enregistrée.
   */
  async creer(nouvel: NouvelUtilisateur): Promise<CompteCree> {
    const motDePasseProvisoire = genererMotDePasseProvisoire();
    const utilisateur = await this.depot.creerUtilisateur(
      nouvel,
      await hacherMotDePasse(motDePasseProvisoire),
    );
    if (utilisateur === null) {
      throw new ConflictException(EMAIL_DEJA_UTILISE);
    }
    return { utilisateur, motDePasseProvisoire };
  }

  consulter(id: number): Promise<UtilisateurApi> {
    return this.trouver(id);
  }

  async modifier(
    id: number,
    modification: ModificationUtilisateur,
    auteur: UtilisateurConnecte,
  ): Promise<UtilisateurApi> {
    const compte = await this.trouver(id);
    if (modification.role !== undefined && modification.role !== compte.role) {
      if (id === auteur.id) {
        // Sinon l'entreprise pourrait se retrouver sans administrateur.
        throw new BadRequestException('Un administrateur ne peut pas retirer son propre rôle.');
      }
      if (compte.role === 'TECHNICIEN' && (await this.depot.aUneFicheTechnicien(id))) {
        throw new ConflictException(
          'Ce compte a une fiche technicien : ses tournées pointeraient vers un compte qui ne serait plus technicien.',
        );
      }
    }
    const modifie = await this.depot.modifierCompte(id, modification);
    if (modifie === null) {
      throw new ConflictException(EMAIL_DEJA_UTILISE);
    }
    return modifie;
  }

  /** Les sessions sont coupées ; le jeton d'accès déjà émis expire en 15 minutes au plus (ADR 0007). */
  async desactiver(id: number, auteur: UtilisateurConnecte): Promise<UtilisateurApi> {
    if (id === auteur.id) {
      throw new BadRequestException('Un administrateur ne peut pas désactiver son propre compte.');
    }
    await this.trouver(id);
    return this.depot.desactiver(id, this.horloge.maintenant());
  }

  async activer(id: number): Promise<UtilisateurApi> {
    await this.trouver(id);
    return this.depot.activer(id);
  }

  private async trouver(id: number): Promise<UtilisateurApi> {
    const utilisateur = await this.depot.trouverUtilisateur(id);
    if (utilisateur === null) {
      throw new NotFoundException('Compte introuvable.');
    }
    return utilisateur;
  }
}
