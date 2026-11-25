import type { CelluleCsv } from '../commun/csv/ecrire-csv.js';
import { heureMetier, jourMetier } from '../commun/fuseau-metier.js';
import type { InterventionDetaillee } from './intervention-detaillee.js';
import { nomAffiche } from './interventions.presentation.js';

/*
 * Lignes de GET /interventions/export (US29, docs/api.md section 6.12).
 *
 * Minimisation (RGPD) : ni le téléphone ni l'e-mail du client, ni la rue, ni les informations
 * d'accès, ni le compte rendu, ni le motif d'annulation. De la signature (US33), seulement le fait
 * qu'elle existe : ni l'image, ni le nom du signataire, ni l'empreinte.
 */

export const COLONNES_EXPORT_INTERVENTIONS = [
  'id',
  'cree_le',
  'client',
  'code_postal',
  'ville',
  'type_intervention',
  'description',
  'urgence',
  'statut',
  'duree_estimee_min',
  'debut_prevu',
  'technicien',
  'ordre_tournee',
  'terminee_le',
  'signee',
] as const;

/** Une ligne par intervention, dans l'ordre reçu (celui de GET /interventions). */
export function versLignesCsvInterventions(
  interventions: readonly InterventionDetaillee[],
): CelluleCsv[][] {
  return interventions.map(versLigne);
}

function versLigne(intervention: InterventionDetaillee): CelluleCsv[] {
  const { adresse, tournee } = intervention;
  return [
    intervention.id,
    jourMetier(intervention.creeLe),
    nomAffiche(adresse.client),
    adresse.codePostal,
    adresse.ville,
    intervention.typeIntervention.libelle,
    intervention.description,
    intervention.urgence,
    intervention.statut,
    intervention.dureeEstimeeMin,
    jourEtHeureMetier(intervention.debutPrevu),
    tournee === null
      ? null
      : `${tournee.technicien.utilisateur.prenom} ${tournee.technicien.utilisateur.nom}`,
    intervention.ordreTournee,
    jourEtHeureMetier(intervention.termineeLe),
    intervention.signature === null ? 'non' : 'oui',
  ];
}

/** « 2026-11-27 08:00 » à La Réunion, jamais à l'heure du serveur. */
function jourEtHeureMetier(instant: Date | null): string | null {
  return instant === null ? null : `${jourMetier(instant)} ${heureMetier(instant)}`;
}
