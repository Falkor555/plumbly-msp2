import { useState } from 'react';
import { type ErreursSaisie, nombreDErreurs } from '../commun/saisie';
import {
  SAISIE_NOUVEAU_TECHNICIEN,
  type SaisieDuCompte,
  type SaisieNouveauTechnicien,
  validerNouveauTechnicien,
} from './validationTechnicien';

export interface SaisieDuFormulaireTechnicien {
  saisie: SaisieNouveauTechnicien;
  erreurs: ErreursSaisie<SaisieNouveauTechnicien>;
  /** Champs refusés au dernier envoi : le résumé garde ce nombre pendant les corrections. */
  nombreAuRefus: number;
  changer: <C extends keyof SaisieNouveauTechnicien>(
    champ: C,
    valeur: SaisieNouveauTechnicien[C],
  ) => void;
  /** Vrai si la saisie peut partir ; sinon les champs refusés portent leur message. */
  valider: (saisieDuCompte: SaisieDuCompte) => boolean;
}

/** Saisie de la création d'une fiche technicien (US11), avec ses erreurs de validation. */
export function useSaisieNouveauTechnicien(): SaisieDuFormulaireTechnicien {
  const [saisie, setSaisie] = useState(SAISIE_NOUVEAU_TECHNICIEN);
  const [erreurs, setErreurs] = useState<ErreursSaisie<SaisieNouveauTechnicien>>({});
  const [nombreAuRefus, setNombreAuRefus] = useState(0);
  return {
    saisie,
    erreurs,
    nombreAuRefus,
    changer: (champ, valeur) => {
      setSaisie((precedente) => ({ ...precedente, [champ]: valeur }));
      setErreurs((precedentes) => ({ ...precedentes, [champ]: undefined }));
    },
    valider: (saisieDuCompte) => {
      const nouvellesErreurs = validerNouveauTechnicien(saisie, saisieDuCompte);
      setErreurs(nouvellesErreurs);
      setNombreAuRefus(nombreDErreurs(nouvellesErreurs));
      return nombreDErreurs(nouvellesErreurs) === 0;
    },
  };
}
