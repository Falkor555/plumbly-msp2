import { type FormEvent, useId, useRef, useState } from 'react';
import { clientsApi } from '../api/clients.api';
import type { Adresse } from '../api/types';
import { BoutonsDuFormulaire } from '../commun/BoutonsDuFormulaire';
import { Fenetre } from '../commun/Fenetre';
import { ResumeDesErreurs } from '../commun/ResumeDesErreurs';
import { type ErreursSaisie, nombreDErreurs } from '../commun/saisie';
import { useSoumission } from '../commun/useSoumission';
import { ChampsAdresse } from './ChampsAdresse';
import {
  type SaisieAdresse,
  saisieDeLAdresse,
  validerAdresse,
  versModificationAdresse,
  versNouvelleAdresse,
} from './validationClient';

interface Props {
  idClient: number;
  /** Absent : nouvelle adresse (US07). Présente : correction de cette adresse. */
  adresse?: Adresse;
  onFermer: () => void;
  /** L'adresse enregistrée ; l'appelant ferme la fenêtre et relit la fiche. */
  onEnregistree: (adresse: Adresse) => void;
}

/**
 * US07 : ajout ou correction d'une adresse d'intervention. Une correction sert aux fautes de frappe
 * et aux codes d'accès ; un déménagement est une nouvelle adresse, pour ne pas réécrire
 * l'historique des interventions passées (backend, ClientsService.modifierAdresse).
 */
export function FenetreAdresse({ idClient, adresse, onFermer, onEnregistree }: Props) {
  const ajout = adresse === undefined;
  const idTitre = useId();
  const premierChamp = useRef<HTMLInputElement>(null);
  const [saisie, setSaisie] = useState(() => saisieDeLAdresse(adresse));
  const [erreurs, setErreurs] = useState<ErreursSaisie<SaisieAdresse>>({});
  const [nombreAuRefus, setNombreAuRefus] = useState(0);
  const { formulaire, repliApresEchec, envoiEnCours, refus, erreurServeur, soumettre } =
    useSoumission('Adresse non enregistrée');

  async function envoyer(): Promise<void> {
    if (adresse === undefined) {
      onEnregistree(await clientsApi.ajouterAdresse(idClient, versNouvelleAdresse(saisie)));
      return;
    }
    const modification = versModificationAdresse(adresse, saisie);
    if (Object.keys(modification).length === 0) {
      onFermer();
      return;
    }
    onEnregistree(await clientsApi.modifierAdresse(idClient, adresse.id, modification));
  }

  function enregistrer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const nouvellesErreurs = validerAdresse(saisie);
    setErreurs(nouvellesErreurs);
    setNombreAuRefus(nombreDErreurs(nouvellesErreurs));
    void soumettre(nombreDErreurs(nouvellesErreurs) === 0, envoyer);
  }

  function changer(champ: keyof SaisieAdresse, valeur: string) {
    setSaisie((precedente) => ({ ...precedente, [champ]: valeur }));
    setErreurs((precedentes) => ({ ...precedentes, [champ]: undefined }));
  }

  return (
    <Fenetre
      idTitre={idTitre}
      onFermer={onFermer}
      focusInitial={premierChamp}
      fermableParEchap={!envoiEnCours}
    >
      <header className="border-b border-bordure px-4 py-4 sm:px-6">
        <h2 id={idTitre} className="text-lg font-semibold">
          {ajout ? 'Ajouter une adresse' : 'Corriger l’adresse'}
        </h2>
        <p className="text-sm text-gris-texte">
          {ajout
            ? 'Nouvelle adresse d’intervention du client.'
            : 'Pour un déménagement, ajoutez plutôt une nouvelle adresse : l’historique garde l’ancienne.'}
        </p>
      </header>
      <form
        ref={formulaire}
        noValidate
        onSubmit={enregistrer}
        className="space-y-4 px-4 py-4 sm:px-6"
      >
        <ChampsAdresse
          saisie={saisie}
          erreurs={erreurs}
          onChanger={changer}
          desactive={envoiEnCours}
          refPremierChamp={premierChamp}
        />
        <ResumeDesErreurs
          key={refus}
          nombreAuRefus={nombreAuRefus}
          restantes={nombreDErreurs(erreurs)}
          erreurServeur={erreurServeur}
        />
        <BoutonsDuFormulaire
          libelleEnvoi={libelleEnvoi(ajout, envoiEnCours)}
          envoiEnCours={envoiEnCours}
          onAnnuler={onFermer}
          refEnvoi={repliApresEchec}
        />
      </form>
    </Fenetre>
  );
}

function libelleEnvoi(ajout: boolean, envoiEnCours: boolean): string {
  if (ajout) return envoiEnCours ? 'Ajout en cours…' : 'Ajouter l’adresse';
  return envoiEnCours ? 'Enregistrement en cours…' : 'Enregistrer la correction';
}
