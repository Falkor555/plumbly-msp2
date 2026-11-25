import { BadRequestException } from '@nestjs/common';
import { StatutIntervention } from '../generated/prisma/client.ts';

/*
 * Cycle de vie d'une intervention (cahier des charges, section 5.1). C'est le seul endroit qui
 * dit quel statut mène à quel statut : les services l'appellent avant toute écriture, et les
 * contraintes CHECK de la base ne restent qu'un filet de sécurité.
 *
 *   À planifier ──affecter──▶ Planifiée ──démarrer──▶ En cours ──terminer──▶ Terminée
 *        ▲                        │                       │
 *        └────────retirer─────────┘                       │
 *   À planifier, Planifiée, En cours ──annuler──▶ Annulée
 *
 * Terminée et Annulée sont définitives (RG06).
 */

export type ActionSurIntervention = 'affecter' | 'retirer' | 'demarrer' | 'terminer' | 'annuler';

interface Transition {
  depuis: readonly StatutIntervention[];
  vers: StatutIntervention;
}

const { A_PLANIFIER, PLANIFIEE, EN_COURS, TERMINEE, ANNULEE } = StatutIntervention;

export const TRANSITIONS: Readonly<Record<ActionSurIntervention, Transition>> = {
  affecter: { depuis: [A_PLANIFIER], vers: PLANIFIEE }, // RG02 (tournées)
  retirer: { depuis: [PLANIFIEE], vers: A_PLANIFIER }, // RG04 (tournées)
  demarrer: { depuis: [PLANIFIEE], vers: EN_COURS }, // RG03
  terminer: { depuis: [EN_COURS], vers: TERMINEE }, // RG03
  annuler: { depuis: [A_PLANIFIER, PLANIFIEE, EN_COURS], vers: ANNULEE }, // RG05
};

/** Statut tel qu'un gestionnaire le lit à l'écran. */
export const LIBELLES_STATUT: Readonly<Record<StatutIntervention, string>> = {
  A_PLANIFIER: 'à planifier',
  PLANIFIEE: 'planifiée',
  EN_COURS: 'en cours',
  TERMINEE: 'terminée',
  ANNULEE: 'annulée',
};

const VERBES: Readonly<Record<ActionSurIntervention, string>> = {
  affecter: 'd’affecter',
  retirer: 'de retirer',
  demarrer: 'de démarrer',
  terminer: 'de terminer',
  annuler: 'd’annuler',
};

/**
 * Statut d'arrivée de l'action, ou 400 si le statut de départ ne la permet pas, par exemple
 * « Impossible de démarrer une intervention terminée. »
 */
export function statutApres(
  statut: StatutIntervention,
  action: ActionSurIntervention,
): StatutIntervention {
  const transition = TRANSITIONS[action];
  if (!transition.depuis.includes(statut)) {
    throw new BadRequestException(
      `Impossible ${VERBES[action]} une intervention ${LIBELLES_STATUT[statut]}.`,
    );
  }
  return transition.vers;
}

/**
 * RG06 et RG15 : on ne modifie qu'une intervention à planifier ou planifiée. L'adresse ne change
 * que tant que l'intervention n'est dans aucune tournée : le créneau a été choisi pour elle.
 */
export function verifierModifiable(
  statut: StatutIntervention,
  { changeAdresse }: { changeAdresse: boolean },
): void {
  if (statut !== A_PLANIFIER && statut !== PLANIFIEE) {
    throw new BadRequestException(
      `Une intervention ${LIBELLES_STATUT[statut]} ne peut plus être modifiée.`,
    );
  }
  if (changeAdresse && statut === PLANIFIEE) {
    throw new BadRequestException(
      'L’adresse d’une intervention planifiée ne peut pas changer : retirez-la d’abord de sa tournée.',
    );
  }
}

/**
 * US18 : seule modification permise après « terminée » (exception à RG06). RG33 : le compte
 * rendu signé par le client est définitif, sinon la signature confirmerait un autre texte.
 */
export function verifierCompteRenduModifiable(
  statut: StatutIntervention,
  { signee }: { signee: boolean },
): void {
  if (statut !== TERMINEE) {
    throw new BadRequestException(
      `Le compte rendu se complète sur une intervention terminée (statut actuel : ${LIBELLES_STATUT[statut]}).`,
    );
  }
  if (signee) {
    throw new BadRequestException('Le compte rendu d’une intervention signée ne se modifie plus.');
  }
}
