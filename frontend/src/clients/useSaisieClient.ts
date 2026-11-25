import { useState } from 'react';
import type { Client, TypeClient } from '../api/types';
import {
  type ChampTexteClient,
  type ErreursSaisie,
  nombreDErreurs,
  type SaisieAdresse,
  type SaisieClient,
  saisieDeLAdresse,
  saisieDuClient,
  validerAdresse,
  validerClient,
} from './validationClient';

export interface SaisieDuFormulaireClient {
  saisie: SaisieClient;
  /** Première adresse, saisie seulement à la création. */
  adresse: SaisieAdresse;
  erreursClient: ErreursSaisie<SaisieClient>;
  erreursAdresse: ErreursSaisie<SaisieAdresse>;
  /** Champs refusés au dernier envoi : le résumé garde ce nombre pendant les corrections. */
  nombreAuRefus: number;
  /** Champs encore en erreur ; le résumé disparaît à zéro. */
  restantes: number;
  changerChamp: (champ: ChampTexteClient, valeur: string) => void;
  changerType: (typeClient: TypeClient) => void;
  changerAdresse: (champ: keyof SaisieAdresse, valeur: string) => void;
  /** Valide la saisie (l'adresse seulement à la création) et renvoie le nombre de champs refusés. */
  valider: (avecAdresse: boolean) => number;
}

/** Saisie du formulaire client et de sa première adresse, avec leurs erreurs de validation. */
export function useSaisieClient(client?: Client): SaisieDuFormulaireClient {
  const [saisie, setSaisie] = useState(() => saisieDuClient(client));
  const [adresse, setAdresse] = useState(() => saisieDeLAdresse());
  const [erreursClient, setErreursClient] = useState<ErreursSaisie<SaisieClient>>({});
  const [erreursAdresse, setErreursAdresse] = useState<ErreursSaisie<SaisieAdresse>>({});
  const [nombreAuRefus, setNombreAuRefus] = useState(0);

  function valider(avecAdresse: boolean): number {
    const nouvellesErreursClient = validerClient(saisie);
    const nouvellesErreursAdresse = avecAdresse ? validerAdresse(adresse) : {};
    setErreursClient(nouvellesErreursClient);
    setErreursAdresse(nouvellesErreursAdresse);
    const nombre = nombreDErreurs(nouvellesErreursClient) + nombreDErreurs(nouvellesErreursAdresse);
    setNombreAuRefus(nombre);
    return nombre;
  }

  return {
    saisie,
    adresse,
    erreursClient,
    erreursAdresse,
    nombreAuRefus,
    restantes: nombreDErreurs(erreursClient) + nombreDErreurs(erreursAdresse),
    changerChamp: (champ, valeur) => {
      setSaisie((precedente) => ({ ...precedente, [champ]: valeur }));
      setErreursClient((precedentes) => ({ ...precedentes, [champ]: undefined }));
    },
    changerType: (typeClient) => {
      setSaisie((precedente) => ({ ...precedente, typeClient }));
      // Le champ obligatoire change avec le type : l'ancienne erreur ne vaut plus.
      setErreursClient((precedentes) => ({
        ...precedentes,
        nomClient: undefined,
        raisonSociale: undefined,
      }));
    },
    changerAdresse: (champ, valeur) => {
      setAdresse((precedente) => ({ ...precedente, [champ]: valeur }));
      setErreursAdresse((precedentes) => ({ ...precedentes, [champ]: undefined }));
    },
    valider,
  };
}
