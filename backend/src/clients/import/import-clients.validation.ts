import type { SeparateurCsv } from '../../commun/csv/lire-csv.js';
import {
  type Champs,
  lireEnumeration,
  lireObjet,
  signalerErreurs,
} from '../../commun/validation.js';
import {
  type Correspondance,
  type DemandeAnalyse,
  type DemandeImport,
  STRATEGIES_DOUBLONS,
} from './import-clients.types.js';

/*
 * Corps des routes d'import (contrat d'API, section 6.12) : le navigateur lit le fichier
 * (File.text()) et envoie son texte en JSON. Les champs de la correspondance sont vérifiés avec le
 * fichier (correspondance-colonnes.ts) : ici, seule la forme du corps l'est.
 */

// 1 Mo de fichier : le corps JSON qui le porte est limité à 1,5 Mo (configurer-application.ts).
const LONGUEUR_CONTENU_MAXIMUM = 1_000_000;
const SEPARATEURS: readonly SeparateurCsv[] = [';', ','];
const CHAMPS_ANALYSE = ['contenu', 'separateur', 'correspondance'] as const;

/** POST /clients/import/analysis : strategieDoublons y est refusée, rien n'est enregistré. */
export function lireDemandeAnalyse(corps: unknown): DemandeAnalyse {
  const champs = lireObjet(corps, CHAMPS_ANALYSE);
  const erreurs: string[] = [];
  const demande = lireChampsCommuns(champs, erreurs);
  signalerErreurs(erreurs);
  return demande;
}

/** POST /clients/import : la stratégie des doublons est obligatoire (RG28). */
export function lireDemandeImport(corps: unknown): DemandeImport {
  const champs = lireObjet(corps, [...CHAMPS_ANALYSE, 'strategieDoublons']);
  const erreurs: string[] = [];
  const demande = lireChampsCommuns(champs, erreurs);
  const strategieDoublons = lireEnumeration(
    champs,
    'strategieDoublons',
    STRATEGIES_DOUBLONS,
    erreurs,
    { obligatoire: true },
  );
  signalerErreurs(erreurs);
  return { ...demande, strategieDoublons: strategieDoublons as DemandeImport['strategieDoublons'] };
}

// ---------- Outils ----------

function lireChampsCommuns(champs: Champs, erreurs: string[]): DemandeAnalyse {
  const demande: DemandeAnalyse = { contenu: lireContenu(champs.contenu, erreurs) ?? '' };
  const separateur = lireEnumeration(champs, 'separateur', SEPARATEURS, erreurs, {
    obligatoire: false,
  });
  if (separateur !== undefined) {
    demande.separateur = separateur;
  }
  const correspondance = lireCorrespondance(champs.correspondance, erreurs);
  if (correspondance !== undefined) {
    demande.correspondance = correspondance;
  }
  return demande;
}

/**
 * Le texte du fichier n'est ni réduit ni transformé : un espace ou une fin de ligne fait partie
 * des données. Le navigateur le décode en UTF-8 : un caractère de remplacement U+FFFD trahit un
 * fichier enregistré dans un autre encodage (par exemple Windows-1252 par Excel).
 */
function lireContenu(valeur: unknown, erreurs: string[]): string | undefined {
  if (valeur === undefined || valeur === null) {
    erreurs.push('contenu est obligatoire');
    return undefined;
  }
  if (typeof valeur !== 'string') {
    erreurs.push('contenu doit être un texte');
    return undefined;
  }
  if (valeur.length > LONGUEUR_CONTENU_MAXIMUM) {
    erreurs.push('contenu ne doit pas dépasser 1 000 000 caractères');
    return undefined;
  }
  if (valeur.includes('\uFFFD')) {
    erreurs.push('Enregistrez le fichier au format CSV UTF-8');
    return undefined;
  }
  // PostgreSQL refuse le caractère NUL dans un texte : refusé ici pour tout le fichier.
  if (valeur.includes('\u0000')) {
    erreurs.push('contenu contient un caractère non autorisé');
    return undefined;
  }
  return valeur;
}

/** { "<en-tête du fichier>": "<champ client>" | null } ; les champs sont vérifiés plus loin. */
function lireCorrespondance(valeur: unknown, erreurs: string[]): Correspondance | undefined {
  if (valeur === undefined) {
    return undefined;
  }
  if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) {
    erreurs.push('correspondance doit être un objet');
    return undefined;
  }
  const valeurs = Object.values(valeur);
  if (!valeurs.every((champ) => champ === null || typeof champ === 'string')) {
    erreurs.push('correspondance doit associer chaque en-tête à un champ client ou à null');
    return undefined;
  }
  return valeur as Correspondance;
}
