import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  EtapeTournee,
  InterventionsParStatut,
  Periode,
  TempsDeTraitement,
  TempsDeTraitementParType,
  TempsMoyenDeTraitement,
  TourneeDetaillee,
} from './reporting.types.js';

/**
 * Fuseau métier : une « journée » de l'entreprise est une journée à La Réunion, alors que
 * les instants sont stockés en UTC (timestamptz) et que la session Prisma tourne en UTC.
 */
export const FUSEAU_METIER = 'Indian/Reunion';

type EnteteTournee = Omit<TourneeDetaillee, 'etapes'>;

type LigneTempsDeTraitement = TempsDeTraitement & { typeIntervention: string | null };

/**
 * Requêtes de reporting écrites en SQL à la main.
 *
 * Toutes passent par $queryRaw en gabarit balisé (tagged template) : chaque ${valeur} devient un
 * paramètre lié ($1, $2…) envoyé séparément du texte SQL. PostgreSQL ne l'interprète jamais comme
 * du code, d'où l'interdiction de $queryRawUnsafe et de toute concaténation dans ce fichier.
 */
@Injectable()
export class ReportingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Requête 1 (agrégation) : nombre d'interventions par technicien actif et par statut. */
  compterInterventionsParTechnicienEtStatut({
    du,
    au,
  }: Periode): Promise<InterventionsParStatut[]> {
    // Le filtre de période est dans la jointure et non dans le WHERE : un technicien sans
    // tournée sur la période reste dans le résultat avec des compteurs à zéro.
    // count() renvoie un bigint, que Prisma traduirait en BigInt JavaScript : d'où les ::int.
    return this.prisma.$queryRaw<InterventionsParStatut[]>`
      SELECT
        t.id_technicien AS "idTechnicien",
        u.nom,
        u.prenom,
        count(i.id_intervention)::int AS total,
        count(i.id_intervention) FILTER (WHERE i.statut = 'A_PLANIFIER')::int AS "aPlanifier",
        count(i.id_intervention) FILTER (WHERE i.statut = 'PLANIFIEE')::int AS planifiees,
        count(i.id_intervention) FILTER (WHERE i.statut = 'EN_COURS')::int AS "enCours",
        count(i.id_intervention) FILTER (WHERE i.statut = 'TERMINEE')::int AS terminees,
        count(i.id_intervention) FILTER (WHERE i.statut = 'ANNULEE')::int AS annulees
      FROM technicien t
      JOIN utilisateur u ON u.id_utilisateur = t.id_utilisateur
      LEFT JOIN tournee tr
        ON tr.id_technicien = t.id_technicien
        AND tr.date_tournee BETWEEN ${du}::date AND ${au}::date
      LEFT JOIN intervention i ON i.id_tournee = tr.id_tournee
      WHERE NOT t.archive
      GROUP BY t.id_technicien, u.nom, u.prenom
      ORDER BY u.nom, u.prenom, t.id_technicien`;
  }

  /** Requête 2 (jointures) : tournée d'un technicien pour un jour, étapes dans l'ordre de passage. */
  async detaillerTournee(idTechnicien: number, date: string): Promise<TourneeDetaillee | null> {
    // to_char : la date de tournée reste une date calendaire. Lue en Date JavaScript, elle
    // deviendrait un instant à minuit UTC, soit 4 h du matin à La Réunion.
    const [entete] = await this.prisma.$queryRaw<EnteteTournee[]>`
      SELECT
        tr.id_tournee AS "idTournee",
        to_char(tr.date_tournee, 'YYYY-MM-DD') AS "dateTournee",
        t.id_technicien AS "idTechnicien",
        u.nom AS "nomTechnicien",
        u.prenom AS "prenomTechnicien"
      FROM tournee tr
      JOIN technicien t ON t.id_technicien = tr.id_technicien
      JOIN utilisateur u ON u.id_utilisateur = t.id_utilisateur
      WHERE tr.id_technicien = ${idTechnicien}
        AND tr.date_tournee = ${date}::date`;
    if (entete === undefined) {
      return null;
    }

    const etapes = await this.prisma.$queryRaw<EtapeTournee[]>`
      SELECT
        i.ordre_tournee AS ordre,
        i.id_intervention AS "idIntervention",
        i.statut,
        i.urgence,
        i.debut_prevu AS "debutPrevu",
        i.fin_prevue AS "finPrevue",
        i.duree_estimee_min AS "dureeEstimeeMin",
        ti.libelle AS "typeIntervention",
        i.description,
        coalesce(c.raison_sociale, concat_ws(' ', c.prenom_client, c.nom_client)) AS client,
        c.telephone AS "telephoneClient",
        a.rue,
        a.complement,
        a.code_postal AS "codePostal",
        a.ville,
        a.infos_acces AS "infosAcces"
      FROM intervention i
      JOIN type_intervention ti ON ti.id_type_intervention = i.id_type_intervention
      JOIN adresse a ON a.id_adresse = i.id_adresse
      JOIN client c ON c.id_client = a.id_client
      WHERE i.id_tournee = ${entete.idTournee}
      ORDER BY i.ordre_tournee`;

    return { ...entete, etapes };
  }

  /** Requête 3 : temps moyen passé sur place par type d'intervention, avec une ligne d'ensemble. */
  async calculerTempsMoyenDeTraitement({ du, au }: Periode): Promise<TempsMoyenDeTraitement> {
    // Les bornes sont converties une fois en instants UTC (minuit à La Réunion) au lieu de convertir
    // terminee_le ligne par ligne : la colonne reste comparée telle quelle, un index reste utilisable.
    // ROLLUP ajoute la ligne d'ensemble (libellé NULL), calculée sur toutes les interventions et
    // non comme une moyenne des moyennes par type.
    const lignes = await this.prisma.$queryRaw<LigneTempsDeTraitement[]>`
      SELECT
        ti.libelle AS "typeIntervention",
        count(*)::int AS "nombreInterventions",
        round(avg(extract(epoch FROM i.terminee_le - i.demarree_le)) / 60)::int AS "dureeMoyenneMin",
        round(avg(i.duree_estimee_min))::int AS "dureeEstimeeMoyenneMin"
      FROM intervention i
      JOIN type_intervention ti ON ti.id_type_intervention = i.id_type_intervention
      WHERE i.statut = 'TERMINEE'
        AND i.demarree_le IS NOT NULL
        AND i.terminee_le >= ${du}::date::timestamp AT TIME ZONE ${FUSEAU_METIER}
        AND i.terminee_le < (${au}::date + 1)::timestamp AT TIME ZONE ${FUSEAU_METIER}
      GROUP BY ROLLUP (ti.libelle)
      ORDER BY ti.libelle NULLS LAST`;

    return separerLigneEnsemble(lignes);
  }
}

function separerLigneEnsemble(lignes: LigneTempsDeTraitement[]): TempsMoyenDeTraitement {
  const parType: TempsDeTraitementParType[] = [];
  let ensemble: TempsDeTraitement = {
    nombreInterventions: 0,
    dureeMoyenneMin: null,
    dureeEstimeeMoyenneMin: null,
  };
  for (const { typeIntervention, ...temps } of lignes) {
    if (typeIntervention === null) {
      ensemble = temps;
    } else {
      parType.push({ typeIntervention, ...temps });
    }
  }
  return { parType, ensemble };
}
