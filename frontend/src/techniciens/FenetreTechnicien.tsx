import { type FormEvent, useId, useRef, useState } from 'react';
import { techniciensApi } from '../api/techniciens.api';
import type { FicheTechnicien } from '../api/types';
import { BoutonsDuFormulaire } from '../commun/BoutonsDuFormulaire';
import { Fenetre } from '../commun/Fenetre';
import { ResumeDesErreurs } from '../commun/ResumeDesErreurs';
import { type ErreursSaisie, nombreDErreurs } from '../commun/saisie';
import { useSoumission } from '../commun/useSoumission';
import { nomComplet } from '../planning/presentation';
import { ChampCouleur, ChampTelephone } from './ChampsDuTechnicien';
import {
  type SaisieTechnicien,
  saisieDuTechnicien,
  validerTechnicien,
  versModificationTechnicien,
} from './validationTechnicien';

interface Props {
  technicien: FicheTechnicien;
  onFermer: () => void;
  /** L'API a enregistré la modification ; l'appelant ferme la fenêtre et relit la fiche. */
  onEnregistre: () => void;
}

/**
 * US11 : téléphone et couleur du planning, seules données propres à la fiche. Le nom, le prénom et
 * l'e-mail viennent du compte utilisateur : l'API les refuse ici (400), l'administrateur les
 * modifie dans le compte.
 */
export function FenetreTechnicien({ technicien, onFermer, onEnregistre }: Props) {
  const idTitre = useId();
  const premierChamp = useRef<HTMLInputElement>(null);
  const [saisie, setSaisie] = useState(() => saisieDuTechnicien(technicien));
  const [erreurs, setErreurs] = useState<ErreursSaisie<SaisieTechnicien>>({});
  const [nombreAuRefus, setNombreAuRefus] = useState(0);
  const { formulaire, repliApresEchec, envoiEnCours, refus, erreurServeur, soumettre } =
    useSoumission('Fiche technicien non enregistrée');

  async function envoyer(): Promise<void> {
    const modification = versModificationTechnicien(technicien, saisie);
    if (Object.keys(modification).length === 0) {
      onFermer();
      return;
    }
    await techniciensApi.modifier(technicien.id, modification);
    onEnregistre();
  }

  function enregistrer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const nouvellesErreurs = validerTechnicien(saisie);
    setErreurs(nouvellesErreurs);
    setNombreAuRefus(nombreDErreurs(nouvellesErreurs));
    void soumettre(nombreDErreurs(nouvellesErreurs) === 0, envoyer);
  }

  function changer(champ: keyof SaisieTechnicien, valeur: string) {
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
          Modifier le téléphone et la couleur
        </h2>
        <p className="text-sm text-gris-texte">{nomComplet(technicien)}</p>
      </header>
      <form
        ref={formulaire}
        noValidate
        onSubmit={enregistrer}
        className="space-y-4 px-4 py-4 sm:px-6"
      >
        <ChampTelephone
          ref={premierChamp}
          valeur={saisie.telephone}
          onChanger={(telephone) => changer('telephone', telephone)}
          erreur={erreurs.telephone}
          desactive={envoiEnCours}
        />
        <ChampCouleur
          libelle="Couleur du planning"
          valeur={saisie.couleur}
          onChanger={(couleur) => changer('couleur', couleur)}
          desactive={envoiEnCours}
        />
        <ResumeDesErreurs
          key={refus}
          nombreAuRefus={nombreAuRefus}
          restantes={nombreDErreurs(erreurs)}
          erreurServeur={erreurServeur}
        />
        <BoutonsDuFormulaire
          libelleEnvoi={envoiEnCours ? 'Enregistrement en cours…' : 'Enregistrer les modifications'}
          envoiEnCours={envoiEnCours}
          onAnnuler={onFermer}
          refEnvoi={repliApresEchec}
        />
      </form>
    </Fenetre>
  );
}
