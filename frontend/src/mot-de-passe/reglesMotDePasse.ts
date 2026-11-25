/*
 * Politique de mot de passe (cahier des charges, 6.1), affichée pendant la saisie. Ce n'est qu'un
 * guide : l'API applique les mêmes règles et reste seule juge (backend, mots-de-passe.ts).
 */

const LONGUEUR_MINIMUM = 12;
const LONGUEUR_MAXIMUM = 128;

export interface RegleMotDePasse {
  libelle: string;
  estRespectee: (motDePasse: string) => boolean;
}

export const REGLES_MOT_DE_PASSE: readonly RegleMotDePasse[] = [
  {
    libelle: `Au moins ${LONGUEUR_MINIMUM} caractères`,
    estRespectee: (motDePasse) => motDePasse.length >= LONGUEUR_MINIMUM,
  },
  { libelle: 'Une majuscule', estRespectee: (motDePasse) => /[A-Z]/.test(motDePasse) },
  { libelle: 'Une minuscule', estRespectee: (motDePasse) => /[a-z]/.test(motDePasse) },
  { libelle: 'Un chiffre', estRespectee: (motDePasse) => /\d/.test(motDePasse) },
  {
    libelle: 'Un caractère spécial',
    estRespectee: (motDePasse) => /[^A-Za-z0-9]/.test(motDePasse),
  },
];

export function respecteLaPolitique(motDePasse: string): boolean {
  return (
    motDePasse.length <= LONGUEUR_MAXIMUM &&
    REGLES_MOT_DE_PASSE.every((regle) => regle.estRespectee(motDePasse))
  );
}
