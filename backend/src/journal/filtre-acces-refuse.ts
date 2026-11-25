import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { RequeteAuthentifiee } from '../commun/autorisation/utilisateur-connecte.js';
import { JournalDesActions } from './journal-des-actions.js';

/** Un 403 levé hors d'une route (par un middleware) n'a pas de modèle de route. */
export const ROUTE_INCONNUE = '(hors route)';

/**
 * Trace chaque accès refusé (403) dans le journal (TS-03), qu'il vienne de RolesGuard ou d'un
 * contrôle de propriété dans un service, puis laisse NestJS répondre exactement comme sans ce
 * filtre.
 *
 * Rien n'est tracé pour un 401 : sans utilisateur, il n'y a pas d'auteur, et les échecs de
 * connexion relèvent de l'authentification (#13).
 */
@Injectable()
@Catch(ForbiddenException)
export class FiltreAccesRefuse implements ExceptionFilter<ForbiddenException> {
  constructor(
    private readonly journal: JournalDesActions,
    private readonly adaptateur: HttpAdapterHost,
  ) {}

  catch(exception: ForbiddenException, hote: ArgumentsHost): void {
    if (hote.getType() === 'http') {
      this.journaliser(hote.switchToHttp().getRequest<RequeteAuthentifiee>());
    }
    // L'adaptateur HTTP n'existe qu'une fois l'application créée : il est lu à chaque requête.
    new BaseExceptionFilter(this.adaptateur.httpAdapter).catch(exception, hote);
  }

  private journaliser(requete: RequeteAuthentifiee): void {
    const { user } = requete;
    if (user === undefined) {
      return;
    }
    // Sans attendre : enregistrer() ne lève jamais, et la réponse n'a pas à attendre MongoDB.
    void this.journal.enregistrer({
      type: 'ACCES_REFUSE',
      auteur: { id: user.id, role: user.role },
      methode: requete.method,
      route: modeleDeRoute(requete),
    });
  }
}

/**
 * Modèle de la route (/api/v1/interventions/:id/start), jamais l'URL reçue : l'identifiant réel
 * ou une recherche (?recherche=Hélène) feraient entrer une donnée personnelle dans le journal.
 */
function modeleDeRoute(requete: RequeteAuthentifiee): string {
  const chemin: unknown = (requete.route as { path?: unknown } | undefined)?.path;
  return typeof chemin === 'string' ? chemin : ROUTE_INCONNUE;
}
