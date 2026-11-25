import { useRef, useState } from 'react';
import {
  type ErreurAffichee,
  erreurDEncodage,
  erreurDeTaille,
  type FichierLu,
} from './importClients';

export interface FichierAImporter {
  fichier: FichierLu | null;
  enLecture: boolean;
  /** Refus du fichier par le navigateur (taille, encodage, lecture), avant tout envoi. */
  refus: ErreurAffichee | null;
  choisir: (choisi: File) => Promise<void>;
  refuser: (refus: ErreurAffichee) => void;
  oublier: () => void;
}

/**
 * Étape 1 de l'import (US31) : lecture du fichier choisi, une seule fois, par le navigateur.
 * Un fichier trop lourd ou mal encodé est refusé ici, sans requête.
 */
export function useFichierAImporter(): FichierAImporter {
  const [fichier, setFichier] = useState<FichierLu | null>(null);
  const [enLecture, setEnLecture] = useState(false);
  const [refus, setRefus] = useState<ErreurAffichee | null>(null);
  // Une lecture encore en cours porte sur le fichier précédent : seule la dernière compte.
  const derniereLecture = useRef(0);

  async function choisir(choisi: File): Promise<void> {
    const numero = ++derniereLecture.current;
    setFichier(null);
    setRefus(null);
    const tropGros = erreurDeTaille(choisi.size);
    if (tropGros) {
      setRefus({ message: tropGros, aide: 'Découpez-le en plusieurs fichiers.' });
      return;
    }
    setEnLecture(true);
    const lu = await lireLeFichier(choisi);
    if (numero !== derniereLecture.current) return;
    setEnLecture(false);
    if ('erreur' in lu) setRefus(lu.erreur);
    else setFichier(lu);
  }

  function oublier(): void {
    derniereLecture.current++;
    setFichier(null);
    setRefus(null);
    setEnLecture(false);
  }

  return { fichier, enLecture, refus, choisir, refuser: setRefus, oublier };
}

async function lireLeFichier(fichier: File): Promise<FichierLu | { erreur: ErreurAffichee }> {
  let contenu: string;
  try {
    contenu = await fichier.text();
  } catch (cause) {
    // Fichier déplacé ou supprimé depuis son choix, droit de lecture retiré.
    console.error('Lecture du fichier à importer impossible', cause);
    return { erreur: { message: 'Le fichier n’a pas pu être lu. Choisissez-le de nouveau.' } };
  }
  const encodage = erreurDEncodage(contenu);
  if (encodage) {
    return {
      erreur: {
        message: encodage,
        aide: 'Dans Excel : Fichier, Enregistrer sous, puis le type « CSV UTF-8 (délimité par des virgules) ».',
      },
    };
  }
  return { nom: fichier.name, contenu };
}
