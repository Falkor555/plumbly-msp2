import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface NomAuteur {
  id: number;
  nom: string;
  prenom: string;
}

/**
 * Données PostgreSQL de l'historique : MongoDB ne stocke que les identifiants (modèle de données
 * 8.2), les noms sont lus au moment de la consultation.
 */
@Injectable()
export class HistoriqueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async interventionExiste(idIntervention: number): Promise<boolean> {
    const intervention = await this.prisma.intervention.findUnique({
      where: { id: idIntervention },
      select: { id: true },
    });
    return intervention !== null;
  }

  /** Une seule requête pour tous les auteurs ; un identifiant inconnu est simplement absent. */
  trouverNomsDesAuteurs(idsUtilisateurs: number[]): Promise<NomAuteur[]> {
    return this.prisma.utilisateur.findMany({
      where: { id: { in: idsUtilisateurs } },
      select: { id: true, nom: true, prenom: true },
    });
  }
}
