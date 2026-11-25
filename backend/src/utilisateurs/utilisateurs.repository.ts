import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.ts';
import { dansLOrdreDe, echapperMotif } from '../prisma/outils-de-recherche.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  FiltresUtilisateurs,
  ModificationProfil,
  ModificationUtilisateur,
  NouvelUtilisateur,
  TriUtilisateurs,
  UtilisateurApi,
} from './utilisateurs.types.js';

// select explicite : le hash du mot de passe ne sort jamais de la base par ces lectures.
const CHAMPS_UTILISATEUR = {
  id: true,
  email: true,
  nom: true,
  prenom: true,
  role: true,
  actif: true,
  mdpAChanger: true,
  derniereConnexion: true,
  creeLe: true,
} as const satisfies Prisma.UtilisateurSelect;

const CODE_PRISMA_UNICITE = 'P2002';

// Fragments SQL fixes, choisis dans une liste fermée : aucune donnée reçue n'entre dans le tri.
const ORDRES: Record<TriUtilisateurs, Prisma.Sql> = {
  nom: Prisma.sql`lower(unaccent(u.nom)) ASC, lower(unaccent(u.prenom)) ASC, u.id_utilisateur ASC`,
  '-nom': Prisma.sql`lower(unaccent(u.nom)) DESC, lower(unaccent(u.prenom)) DESC, u.id_utilisateur DESC`,
};

/** Accès aux comptes utilisateurs : seul fichier du module qui parle à PostgreSQL. */
@Injectable()
export class UtilisateursRepository {
  constructor(private readonly prisma: PrismaService) {}

  trouverUtilisateur(id: number): Promise<UtilisateurApi | null> {
    return this.prisma.utilisateur.findUnique({ where: { id }, select: CHAMPS_UTILISATEUR });
  }

  modifierUtilisateur(id: number, modification: ModificationProfil): Promise<UtilisateurApi> {
    return this.prisma.utilisateur.update({
      where: { id },
      data: modification,
      select: CHAMPS_UTILISATEUR,
    });
  }

  /** Seule lecture du hash dans ce module : pour vérifier l'ancien mot de passe. */
  async lireEmpreinte(id: number): Promise<string | null> {
    const compte = await this.prisma.utilisateur.findUnique({
      where: { id },
      select: { motDePasseHash: true },
    });
    return compte?.motDePasseHash ?? null;
  }

  /**
   * Nouveau mot de passe et révocation de toutes les sessions, dans une seule transaction :
   * soit les deux sont faits, soit aucun.
   */
  async changerMotDePasse(id: number, motDePasseHash: string, le: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id },
        data: { motDePasseHash, mdpAChanger: false },
      }),
      this.prisma.jetonRafraichissement.updateMany({
        where: { idUtilisateur: id, revoqueLe: null },
        data: { revoqueLe: le },
      }),
    ]);
  }

  /** Une page de comptes, triée et filtrée en SQL (recherche sans accents). */
  async rechercher(
    filtres: FiltresUtilisateurs,
  ): Promise<{ utilisateurs: UtilisateurApi[]; total: number }> {
    const conditions = conditionsDeRecherche(filtres);
    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM utilisateur u WHERE ${conditions}`;
    const lignes = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT u.id_utilisateur AS id
      FROM utilisateur u
      WHERE ${conditions}
      ORDER BY ${ORDRES[filtres.tri]}
      LIMIT ${filtres.limit} OFFSET ${(filtres.page - 1) * filtres.limit}`;
    const ids = lignes.map(({ id }) => id);
    const utilisateurs = await this.prisma.utilisateur.findMany({
      where: { id: { in: ids } },
      select: CHAMPS_UTILISATEUR,
    });
    return { utilisateurs: dansLOrdreDe(ids, utilisateurs), total };
  }

  /** null si l'e-mail est déjà utilisé : la contrainte UNIQUE tranche, même pour deux créations simultanées. */
  async creerUtilisateur(
    nouvel: NouvelUtilisateur,
    motDePasseHash: string,
  ): Promise<UtilisateurApi | null> {
    try {
      return await this.prisma.utilisateur.create({
        data: { ...nouvel, motDePasseHash, mdpAChanger: true },
        select: CHAMPS_UTILISATEUR,
      });
    } catch (erreur) {
      if (estUnDoublon(erreur)) {
        return null;
      }
      throw erreur;
    }
  }

  /** null si le nouvel e-mail est déjà utilisé par un autre compte. */
  async modifierCompte(
    id: number,
    modification: ModificationUtilisateur,
  ): Promise<UtilisateurApi | null> {
    try {
      return await this.prisma.utilisateur.update({
        where: { id },
        data: modification,
        select: CHAMPS_UTILISATEUR,
      });
    } catch (erreur) {
      if (estUnDoublon(erreur)) {
        return null;
      }
      throw erreur;
    }
  }

  async aUneFicheTechnicien(id: number): Promise<boolean> {
    const fiche = await this.prisma.technicien.findUnique({
      where: { idUtilisateur: id },
      select: { id: true },
    });
    return fiche !== null;
  }

  /** Désactivation et coupure de toutes les sessions, dans une seule transaction. */
  async desactiver(id: number, le: Date): Promise<UtilisateurApi> {
    const [utilisateur] = await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id },
        data: { actif: false },
        select: CHAMPS_UTILISATEUR,
      }),
      this.prisma.jetonRafraichissement.updateMany({
        where: { idUtilisateur: id, revoqueLe: null },
        data: { revoqueLe: le },
      }),
    ]);
    return utilisateur;
  }

  activer(id: number): Promise<UtilisateurApi> {
    return this.prisma.utilisateur.update({
      where: { id },
      data: { actif: true },
      select: CHAMPS_UTILISATEUR,
    });
  }
}

function estUnDoublon(erreur: unknown): boolean {
  return (
    erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === CODE_PRISMA_UNICITE
  );
}

/** Filtres de GET /users en SQL paramétré : aucune valeur reçue n'est concaténée (TI10). */
function conditionsDeRecherche(filtres: FiltresUtilisateurs): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (filtres.role !== undefined) {
    conditions.push(Prisma.sql`u.role = ${filtres.role}::role_utilisateur`);
  }
  if (filtres.actif !== undefined) {
    conditions.push(Prisma.sql`u.actif = ${filtres.actif}`);
  }
  if (filtres.recherche !== undefined) {
    const motif = `%${echapperMotif(filtres.recherche)}%`;
    conditions.push(Prisma.sql`(
      unaccent(u.nom) ILIKE unaccent(${motif})
      OR unaccent(u.prenom) ILIKE unaccent(${motif})
      OR unaccent(concat_ws(' ', u.prenom, u.nom)) ILIKE unaccent(${motif})
      OR u.email ILIKE ${motif}
    )`);
  }
  return conditions.length === 0 ? Prisma.sql`TRUE` : Prisma.join(conditions, ' AND ');
}
