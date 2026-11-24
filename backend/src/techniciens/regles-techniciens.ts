import { ConflictException } from '@nestjs/common';
import { heureMetier, jourMetier } from '../commun/fuseau-metier.js';

/*
 * Règles de gestion des techniciens (contrat d'API, section 6.6), sans base de données :
 * le service leur passe ce qu'il a lu, elles décident.
 */

export interface Periode {
  debut: Date;
  fin: Date;
}

export interface InterventionRecouverte extends Periode {
  id: number;
}

/**
 * RG10, dans l'autre sens que l'affectation : une indisponibilité ne peut pas recouvrir une
 * intervention planifiée ou en cours. Le message cite chacune, pour que le gestionnaire la retrouve.
 */
export function verifierAucuneInterventionRecouverte(
  interventions: InterventionRecouverte[],
): void {
  if (interventions.length === 0) {
    return;
  }
  const citees = interventions
    .map(({ id, debut, fin }) => `n° ${id} le ${decrire({ debut, fin })}`)
    .join(', ');
  const plusieurs = interventions.length > 1;
  const recouvertes = plusieurs
    ? 'des interventions planifiées ou en cours'
    : 'une intervention planifiée ou en cours';
  const consigne = plusieurs
    ? 'Retirez-les de sa tournée ou déplacez-les d’abord.'
    : 'Retirez-la de sa tournée ou déplacez-la d’abord.';
  throw new ConflictException(
    `La période recouvre ${recouvertes} du technicien : ${citees}. ${consigne}`,
  );
}

/** Deux indisponibilités d'un même technicien ne se recouvrent pas. */
export function verifierAucuneIndisponibiliteRecouverte(indisponibilites: Periode[]): void {
  if (indisponibilites.length === 0) {
    return;
  }
  const citees = indisponibilites.map((periode) => `du ${decrireDebutEtFin(periode)}`).join(', ');
  throw new ConflictException(
    `La période recouvre une autre indisponibilité du technicien : ${citees}.`,
  );
}

/** « 08/12/2026 de 08:00 à 09:00 », à l'heure de La Réunion. */
function decrire({ debut, fin }: Periode): string {
  return `${jourFrancais(debut)} de ${heureMetier(debut)} à ${heureMetier(fin)}`;
}

/** « 08/12/2026 08:00 au 10/12/2026 18:00 », à l'heure de La Réunion. */
function decrireDebutEtFin({ debut, fin }: Periode): string {
  return `${jourFrancais(debut)} ${heureMetier(debut)} au ${jourFrancais(fin)} ${heureMetier(fin)}`;
}

function jourFrancais(instant: Date): string {
  return jourMetier(instant).split('-').reverse().join('/');
}

/**
 * Couleurs du planning, assez distinctes pour se reconnaître côte à côte. La première est la
 * sarcelle de la charte graphique.
 */
export const PALETTE_PLANNING = [
  '#0F766E',
  '#1E88E5',
  '#AF4C00',
  '#7B1FA2',
  '#2E7D32',
  '#C62828',
  '#00838F',
  '#5D4037',
  '#AD1457',
  '#455A64',
] as const;

/**
 * Première couleur de la palette qu'aucun technicien en service n'utilise ; si toutes sont
 * prises, la moins utilisée (la première de la palette en cas d'égalité).
 */
export function choisirCouleur(couleursUtilisees: string[]): string {
  const utilisations = new Map<string, number>(PALETTE_PLANNING.map((couleur) => [couleur, 0]));
  for (const couleur of couleursUtilisees) {
    const nombre = utilisations.get(couleur.toUpperCase());
    if (nombre !== undefined) {
      utilisations.set(couleur.toUpperCase(), nombre + 1);
    }
  }
  let choisie: string = PALETTE_PLANNING[0];
  for (const couleur of PALETTE_PLANNING) {
    if ((utilisations.get(couleur) ?? 0) < (utilisations.get(choisie) ?? 0)) {
      choisie = couleur;
    }
  }
  return choisie;
}
