import { creerErreurApi, ErreurReseau } from './erreurs';
import { enregistrerJetonAcces, lireJetonAcces, terminerSession } from './jetonAcces';

// En développement, '/api/v1' passe par le proxy Vite : front et API partagent la même origine,
// ce qui évite le CORS et garde le cookie SameSite=Strict utilisable.
const URL_API = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');

export type ValeurParametre = string | number | boolean | null | undefined;
export type ParametresRequete = Record<string, ValeurParametre>;

export interface OptionsRequete {
  methode?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  corps?: unknown;
  parametres?: ParametresRequete;
  signal?: AbortSignal;
  /** Routes publiques (connexion, rafraîchissement, mot de passe oublié) : ni jeton ni nouvel essai. */
  publique?: boolean;
}

interface ReponseJetonAcces {
  accessToken: string;
}

let rafraichissementEnCours: Promise<boolean> | null = null;

export function construireUrl(chemin: string, parametres?: ParametresRequete): string {
  const recherche = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(parametres ?? {})) {
    if (valeur !== undefined && valeur !== null && valeur !== '') {
      recherche.append(cle, String(valeur));
    }
  }
  const chaine = recherche.toString();
  return chaine ? `${URL_API}${chemin}?${chaine}` : `${URL_API}${chemin}`;
}

function construireEnTetes(options: OptionsRequete): Headers {
  const enTetes = new Headers({ Accept: 'application/json' });
  if (options.corps !== undefined) enTetes.set('Content-Type', 'application/json');
  const jeton = lireJetonAcces();
  if (jeton && !options.publique) enTetes.set('Authorization', `Bearer ${jeton}`);
  return enTetes;
}

async function envoyer(chemin: string, options: OptionsRequete): Promise<Response> {
  try {
    return await fetch(construireUrl(chemin, options.parametres), {
      method: options.methode ?? 'GET',
      headers: construireEnTetes(options),
      body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
      // Nécessaire pour que le cookie de rafraîchissement accompagne /auth/refresh et /auth/logout.
      credentials: 'include',
      signal: options.signal,
    });
  } catch (erreur) {
    // Une annulation volontaire (TanStack Query, démontage d'un composant) n'est pas une panne réseau.
    if (erreur instanceof DOMException && erreur.name === 'AbortError') throw erreur;
    throw new ErreurReseau(erreur);
  }
}

/**
 * Demande un nouveau jeton d'accès à partir du cookie httpOnly.
 * Plusieurs requêtes peuvent recevoir un 401 en même temps : elles partagent le même appel,
 * car le jeton de rafraîchissement est renouvelé à chaque usage et un second appel serait refusé.
 */
export function rafraichirJetonAcces(): Promise<boolean> {
  rafraichissementEnCours ??= demanderNouveauJeton().finally(() => {
    rafraichissementEnCours = null;
  });
  return rafraichissementEnCours;
}

async function demanderNouveauJeton(): Promise<boolean> {
  const reponse = await envoyer('/auth/refresh', { methode: 'POST', publique: true });
  if (!reponse.ok) return false;
  const { accessToken } = (await reponse.json()) as ReponseJetonAcces;
  enregistrerJetonAcces(accessToken);
  return true;
}

async function lireCorps<T>(reponse: Response): Promise<T> {
  const texte = await reponse.text();
  // 204 No Content (suppression, déconnexion) : pas de corps à lire.
  return (texte ? JSON.parse(texte) : undefined) as T;
}

export async function requete<T>(chemin: string, options: OptionsRequete = {}): Promise<T> {
  let reponse = await envoyer(chemin, options);

  if (reponse.status === 401 && !options.publique) {
    // Rejouer la requête est sans risque, même pour un POST : le guard JWT l'a refusée
    // avant que le contrôleur ne s'exécute.
    if (await rafraichirJetonAcces()) reponse = await envoyer(chemin, options);
    if (reponse.status === 401) terminerSession();
  }

  if (!reponse.ok) throw await creerErreurApi(reponse);
  return lireCorps<T>(reponse);
}

type OptionsSansCorps = Omit<OptionsRequete, 'methode' | 'corps'>;

export const api = {
  get: <T>(chemin: string, options?: OptionsSansCorps) =>
    requete<T>(chemin, { ...options, methode: 'GET' }),
  post: <T>(chemin: string, corps?: unknown, options?: OptionsSansCorps) =>
    requete<T>(chemin, { ...options, methode: 'POST', corps }),
  patch: <T>(chemin: string, corps: unknown, options?: OptionsSansCorps) =>
    requete<T>(chemin, { ...options, methode: 'PATCH', corps }),
  put: <T>(chemin: string, corps: unknown, options?: OptionsSansCorps) =>
    requete<T>(chemin, { ...options, methode: 'PUT', corps }),
  delete: <T = void>(chemin: string, options?: OptionsSansCorps) =>
    requete<T>(chemin, { ...options, methode: 'DELETE' }),
};
