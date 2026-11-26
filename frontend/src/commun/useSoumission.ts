import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { messageErreur } from './messageErreur';

export interface Soumission {
  /** À poser sur le formulaire : le focus y cherche le premier champ en erreur. */
  formulaire: RefObject<HTMLFormElement | null>;
  /** À poser sur le bouton qui reprend le focus après un échec de l'envoi. */
  repliApresEchec: RefObject<HTMLButtonElement | null>;
  envoiEnCours: boolean;
  /** Nombre d'envois refusés par la validation : sert de clé pour réannoncer le résumé. */
  refus: number;
  /** Message de l'API (400, 409) ou texte générique, à afficher tel quel ; null sans échec. */
  erreurServeur: string | null;
  /**
   * Envoie si la saisie est valide. Sinon, rien ne part et le focus va au premier champ marqué
   * aria-invalid. En cas d'échec, le formulaire reste ouvert avec le message de l'erreur.
   */
  soumettre: (valide: boolean, envoyer: () => Promise<void>) => Promise<void>;
}

/** Envoi d'un formulaire de fenêtre : validation de confort, envoi unique, erreur de l'API. */
export function useSoumission(contexteErreur: string): Soumission {
  const formulaire = useRef<HTMLFormElement>(null);
  const repliApresEchec = useRef<HTMLButtonElement>(null);
  const [refus, setRefus] = useState(0);
  const [echecs, setEchecs] = useState(0);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  useEffect(() => {
    // Après le rendu des messages, pour que le lecteur d'écran lise le champ avec son erreur.
    if (refus === 0) return;
    formulaire.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [refus]);

  // Effet de mise en page : le focus revient dans la mise à jour même qui réactive les boutons.
  // Cette mise à jour vient d'une réponse réseau, et react-dom 19 diffère alors un effet ordinaire
  // dans une tâche du Scheduler : un test lirait le focus avant qu'il soit posé.
  useLayoutEffect(() => {
    // Le bouton cliqué, désactivé pendant l'envoi, a perdu le focus au profit du document : il
    // revient dans la fenêtre une fois les boutons réactivés, sans quoi le clavier serait perdu.
    if (echecs === 0) return;
    repliApresEchec.current?.focus();
  }, [echecs]);

  async function soumettre(valide: boolean, envoyer: () => Promise<void>): Promise<void> {
    setErreurServeur(null);
    if (!valide) {
      setRefus((precedent) => precedent + 1);
      return;
    }
    setEnvoiEnCours(true);
    try {
      // En cas de succès, l'appelant ferme la fenêtre : l'envoi reste « en cours » jusque-là.
      await envoyer();
    } catch (cause) {
      setErreurServeur(messageErreur(cause, contexteErreur));
      setEnvoiEnCours(false);
      setEchecs((precedent) => precedent + 1);
    }
  }

  return { formulaire, repliApresEchec, envoiEnCours, refus, erreurServeur, soumettre };
}
