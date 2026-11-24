import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.ts';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ModificationTypeIntervention,
  NouveauTypeIntervention,
  TypeInterventionApi,
} from './types-intervention.types.js';

const CODE_PRISMA_UNICITE = 'P2002';
const CODE_PRISMA_INTROUVABLE = 'P2025';

const CHAMPS_DU_TYPE = { id: true, libelle: true, dureeDefautMin: true } as const;

/** Résultat d'une écriture : le type enregistré, ou la raison du refus posée par la base. */
export type EcritureDeType = TypeInterventionApi | 'libelle-deja-utilise' | 'introuvable';

/** Accès aux types d'intervention : seul fichier du module qui parle à PostgreSQL. */
@Injectable()
export class TypesInterventionRepository {
  constructor(private readonly prisma: PrismaService) {}

  lister(): Promise<TypeInterventionApi[]> {
    return this.prisma.typeIntervention.findMany({
      select: CHAMPS_DU_TYPE,
      orderBy: [{ libelle: 'asc' }, { id: 'asc' }],
    });
  }

  creer(type: NouveauTypeIntervention): Promise<EcritureDeType> {
    return refusDeLaBase(
      this.prisma.typeIntervention.create({ data: type, select: CHAMPS_DU_TYPE }),
    );
  }

  modifier(idType: number, modification: ModificationTypeIntervention): Promise<EcritureDeType> {
    return refusDeLaBase(
      this.prisma.typeIntervention.update({
        where: { id: idType },
        data: modification,
        select: CHAMPS_DU_TYPE,
      }),
    );
  }
}

/**
 * La contrainte UNIQUE sur le libellé tranche aussi deux créations simultanées du même libellé :
 * vérifier avant d'écrire laisserait passer les deux.
 */
async function refusDeLaBase(ecriture: Promise<TypeInterventionApi>): Promise<EcritureDeType> {
  try {
    return await ecriture;
  } catch (erreur) {
    if (erreur instanceof Prisma.PrismaClientKnownRequestError) {
      if (erreur.code === CODE_PRISMA_UNICITE) {
        return 'libelle-deja-utilise';
      }
      if (erreur.code === CODE_PRISMA_INTROUVABLE) {
        return 'introuvable';
      }
    }
    throw erreur;
  }
}
