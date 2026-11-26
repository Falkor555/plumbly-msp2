import { type FormEvent, type Ref, useId, useRef, useState } from 'react';
import { techniciensApi } from '../api/techniciens.api';
import type { FicheTechnicien } from '../api/types';
import { BoutonsDuFormulaire } from '../commun/BoutonsDuFormulaire';
import { ChampSaisie } from '../commun/ChampSaisie';
import { Fenetre } from '../commun/Fenetre';
import { ResumeDesErreurs } from '../commun/ResumeDesErreurs';
import { type ErreursSaisie, nombreDErreurs } from '../commun/saisie';
import { useSoumission } from '../commun/useSoumission';
import { nomComplet } from '../planning/presentation';
import {
  DERNIER_JOUR_SAISISSABLE,
  LONGUEUR_MOTIF,
  SAISIE_INDISPONIBILITE_VIDE,
  type SaisieIndisponibilite,
  validerIndisponibilite,
  versNouvelleIndisponibilite,
} from './indisponibilites';

interface Props {
  technicien: FicheTechnicien;
  onFermer: () => void;
  /** L'API a enregistré l'indisponibilité ; l'appelant ferme la fenêtre et relit la liste. */
  onEnregistree: () => void;
}

/**
 * US12 : nouvelle indisponibilité du technicien. Début et fin se saisissent en deux champs chacun
 * (date puis heure) : un champ date-heure unique ne se tape pas de façon fiable partout. L'heure
 * est celle de La Réunion ; l'instant part avec son fuseau. Le refus de l'API (400, ou 409 quand la
 * période recouvre une intervention ou une autre indisponibilité, RG10) s'affiche tel quel.
 */
export function FenetreIndisponibilite({ technicien, onFermer, onEnregistree }: Props) {
  const idTitre = useId();
  const premierChamp = useRef<HTMLInputElement>(null);
  const [saisie, setSaisie] = useState(SAISIE_INDISPONIBILITE_VIDE);
  const [erreurs, setErreurs] = useState<ErreursSaisie<SaisieIndisponibilite>>({});
  const [nombreAuRefus, setNombreAuRefus] = useState(0);
  const { formulaire, repliApresEchec, envoiEnCours, refus, erreurServeur, soumettre } =
    useSoumission('Indisponibilité non enregistrée');

  async function envoyer(): Promise<void> {
    await techniciensApi.ajouterIndisponibilite(technicien.id, versNouvelleIndisponibilite(saisie));
    onEnregistree();
  }

  function enregistrer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const nouvellesErreurs = validerIndisponibilite(saisie);
    setErreurs(nouvellesErreurs);
    setNombreAuRefus(nombreDErreurs(nouvellesErreurs));
    void soumettre(nombreDErreurs(nouvellesErreurs) === 0, envoyer);
  }

  function changer(champ: keyof SaisieIndisponibilite, valeur: string) {
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
          Ajouter une indisponibilité
        </h2>
        <p className="text-sm text-gris-texte">
          {nomComplet(technicien)} ne pourra pas être planifié sur cette période.
        </p>
      </header>
      <form
        ref={formulaire}
        noValidate
        onSubmit={enregistrer}
        className="space-y-4 px-4 py-4 sm:px-6"
      >
        <ChampsDateHeure
          moment="début"
          jour={saisie.jourDebut}
          heure={saisie.heureDebut}
          erreurJour={erreurs.jourDebut}
          erreurHeure={erreurs.heureDebut}
          onChangerJour={(jour) => changer('jourDebut', jour)}
          onChangerHeure={(heure) => changer('heureDebut', heure)}
          desactive={envoiEnCours}
          refJour={premierChamp}
        />
        <ChampsDateHeure
          moment="fin"
          jour={saisie.jourFin}
          heure={saisie.heureFin}
          erreurJour={erreurs.jourFin}
          erreurHeure={erreurs.heureFin}
          onChangerJour={(jour) => changer('jourFin', jour)}
          onChangerHeure={(heure) => changer('heureFin', heure)}
          desactive={envoiEnCours}
        />
        <ChampSaisie
          libelle="Motif"
          aide="Facultatif, par exemple « Congés » ou « Formation »."
          longueurMax={LONGUEUR_MOTIF}
          valeur={saisie.motif}
          onChanger={(motif) => changer('motif', motif)}
          desactive={envoiEnCours}
        />
        <ResumeDesErreurs
          key={refus}
          nombreAuRefus={nombreAuRefus}
          restantes={nombreDErreurs(erreurs)}
          erreurServeur={erreurServeur}
        />
        <BoutonsDuFormulaire
          libelleEnvoi={envoiEnCours ? 'Ajout en cours…' : 'Ajouter l’indisponibilité'}
          envoiEnCours={envoiEnCours}
          onAnnuler={onFermer}
          refEnvoi={repliApresEchec}
        />
      </form>
    </Fenetre>
  );
}

interface PropsDateHeure {
  moment: 'début' | 'fin';
  jour: string;
  heure: string;
  erreurJour?: string;
  erreurHeure?: string;
  onChangerJour: (jour: string) => void;
  onChangerHeure: (heure: string) => void;
  desactive: boolean;
  refJour?: Ref<HTMLInputElement>;
}

/** Date et heure d'un même moment, côte à côte quand la fenêtre est assez large. */
function ChampsDateHeure({
  moment,
  jour,
  heure,
  erreurJour,
  erreurHeure,
  onChangerJour,
  onChangerHeure,
  desactive,
  refJour,
}: PropsDateHeure) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ChampSaisie
        ref={refJour}
        libelle={`Date de ${moment}`}
        obligatoire
        type="date"
        max={DERNIER_JOUR_SAISISSABLE}
        valeur={jour}
        onChanger={onChangerJour}
        erreur={erreurJour}
        desactive={desactive}
      />
      <ChampSaisie
        libelle={`Heure de ${moment}`}
        obligatoire
        type="time"
        aide="Heure de La Réunion."
        valeur={heure}
        onChanger={onChangerHeure}
        erreur={erreurHeure}
        desactive={desactive}
      />
    </div>
  );
}
