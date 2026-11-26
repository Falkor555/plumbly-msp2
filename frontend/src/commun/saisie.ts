/** Message d'erreur par champ d'un formulaire ; un champ absent est valide. */
export type ErreursSaisie<T> = Partial<Record<keyof T, string>>;

export function nombreDErreurs<T>(erreurs: ErreursSaisie<T>): number {
  return Object.values(erreurs).filter((message) => message !== undefined).length;
}
