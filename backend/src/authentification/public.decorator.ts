import { SetMetadata } from '@nestjs/common';

export const CLE_PUBLIC = 'routePublique';

/**
 * Route accessible sans jeton d'accès : connexion, rafraîchissement, route de démarrage.
 * Toutes les autres routes exigent un jeton : un oubli ferme l'accès au lieu de l'ouvrir.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(CLE_PUBLIC, true);
