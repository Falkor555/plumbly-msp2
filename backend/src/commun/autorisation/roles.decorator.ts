import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client.ts';

export const CLE_ROLES = 'roles';

/** Rôles autorisés sur une route ou un contrôleur (section 5.5 du cahier des charges). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CLE_ROLES, roles);
