import { Injectable } from '@nestjs/common';

/**
 * Source de l'heure courante. Les règles qui dépendent d'« aujourd'hui » (RG12, tournée du jour,
 * RG20) la reçoivent par injection : les tests figent le temps en remplaçant ce fournisseur.
 */
@Injectable()
export class Horloge {
  maintenant(): Date {
    return new Date();
  }
}
