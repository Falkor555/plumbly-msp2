import { type FormEvent, type Ref, useId, useRef } from 'react';
import { clientsApi } from '../api/clients.api';
import type { Client, TypeClient } from '../api/types';
import { ChampSaisie } from '../commun/ChampSaisie';
import { Fenetre } from '../commun/Fenetre';
import { useSoumission } from '../commun/useSoumission';
import { BoutonsDuFormulaire } from './BoutonsDuFormulaire';
import { ChampsAdresse } from './ChampsAdresse';
import { LIBELLES_TYPE_CLIENT } from './presentation';
import { ResumeDesErreurs } from './ResumeDesErreurs';
import { useSaisieClient } from './useSaisieClient';
import {
  type ChampTexteClient,
  type ErreursSaisie,
  LONGUEURS_CLIENT,
  type SaisieAdresse,
  type SaisieClient,
  versModificationClient,
  versNouveauClient,
} from './validationClient';

const TYPES: TypeClient[] = ['PARTICULIER', 'PROFESSIONNEL'];

interface Props {
  /** Absent : création d'un client avec sa première adresse (US06, RG21). Présent : modification. */
  client?: Client;
  onFermer: () => void;
  /** Le client tel que l'API l'a enregistré ; l'appelant ferme la fenêtre. */
  onEnregistre: (client: Client) => void;
}

/**
 * US06, US07 et US10 : création ou modification des coordonnées d'un client. Les champs
 * obligatoires suivent le type : le nom pour un particulier, la raison sociale pour un
 * professionnel. La première adresse n'est demandée qu'à la création ; les suivantes s'ajoutent
 * depuis la fiche.
 */
export function FenetreClient({ client, onFermer, onEnregistre }: Props) {
  const creation = client === undefined;
  const idTitre = useId();
  const premierChamp = useRef<HTMLInputElement>(null);
  const formulaireClient = useSaisieClient(client);
  const { saisie, adresse } = formulaireClient;
  const { formulaire, repliApresEchec, envoiEnCours, refus, erreurServeur, soumettre } =
    useSoumission('Client non enregistré');

  function enregistrer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const valide = formulaireClient.valider(creation) === 0;
    void soumettre(valide, async () => {
      const enregistre = await envoyerLeClient(client, saisie, adresse);
      if (enregistre) onEnregistre(enregistre);
      else onFermer();
    });
  }

  return (
    <Fenetre
      idTitre={idTitre}
      onFermer={onFermer}
      focusInitial={premierChamp}
      fermableParEchap={!envoiEnCours}
      large={creation}
    >
      <header className="border-b border-bordure px-4 py-4 sm:px-6">
        <h2 id={idTitre} className="text-lg font-semibold">
          {creation ? 'Nouveau client' : 'Modifier les coordonnées'}
        </h2>
        <p className="text-sm text-gris-texte">
          {creation ? 'Le client et sa première adresse d’intervention.' : client.nomAffiche}
        </p>
      </header>
      <form
        ref={formulaire}
        noValidate
        onSubmit={enregistrer}
        className="space-y-4 px-4 py-4 sm:px-6"
      >
        <div className={creation ? 'grid gap-6 md:grid-cols-2' : ''}>
          <ChampsIdentite
            saisie={saisie}
            erreurs={formulaireClient.erreursClient}
            onChangerChamp={formulaireClient.changerChamp}
            onChangerType={formulaireClient.changerType}
            desactive={envoiEnCours}
            refPremierChamp={premierChamp}
          />
          {creation && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Adresse d’intervention</legend>
              <ChampsAdresse
                saisie={adresse}
                erreurs={formulaireClient.erreursAdresse}
                onChanger={formulaireClient.changerAdresse}
                desactive={envoiEnCours}
              />
            </fieldset>
          )}
        </div>
        <ResumeDesErreurs
          key={refus}
          nombreAuRefus={formulaireClient.nombreAuRefus}
          restantes={formulaireClient.restantes}
          erreurServeur={erreurServeur}
        />
        <BoutonsDuFormulaire
          libelleEnvoi={libelleEnvoi(creation, envoiEnCours)}
          envoiEnCours={envoiEnCours}
          onAnnuler={onFermer}
          refEnvoi={repliApresEchec}
        />
      </form>
    </Fenetre>
  );
}

/**
 * Crée le client avec sa première adresse, ou n'envoie que les coordonnées modifiées. Renvoie null
 * quand rien n'a changé : aucune requête n'est alors nécessaire.
 */
async function envoyerLeClient(
  client: Client | undefined,
  saisie: SaisieClient,
  adresse: SaisieAdresse,
): Promise<Client | null> {
  if (client === undefined) return clientsApi.creer(versNouveauClient(saisie, adresse));
  const modification = versModificationClient(client, saisie);
  if (Object.keys(modification).length === 0) return null;
  return clientsApi.modifier(client.id, modification);
}

function libelleEnvoi(creation: boolean, envoiEnCours: boolean): string {
  if (creation) return envoiEnCours ? 'Création en cours…' : 'Créer le client';
  return envoiEnCours ? 'Enregistrement en cours…' : 'Enregistrer les modifications';
}

interface PropsIdentite {
  saisie: SaisieClient;
  erreurs: ErreursSaisie<SaisieClient>;
  onChangerChamp: (champ: ChampTexteClient, valeur: string) => void;
  onChangerType: (typeClient: TypeClient) => void;
  desactive: boolean;
  refPremierChamp: Ref<HTMLInputElement>;
}

/** Type, identité et contact. Pour un professionnel, le nom et le prénom sont ceux du contact. */
function ChampsIdentite({
  saisie,
  erreurs,
  onChangerChamp,
  onChangerType,
  desactive,
  refPremierChamp,
}: PropsIdentite) {
  const professionnel = saisie.typeClient === 'PROFESSIONNEL';
  const champ = (nom: ChampTexteClient) => ({
    valeur: saisie[nom],
    onChanger: (valeur: string) => onChangerChamp(nom, valeur),
    erreur: erreurs[nom],
    desactive,
  });
  return (
    <div className="space-y-4">
      <ChoixDuType
        typeClient={saisie.typeClient}
        onChanger={onChangerType}
        desactive={desactive}
        refPremierChamp={refPremierChamp}
      />
      {professionnel && (
        <ChampSaisie
          libelle="Raison sociale"
          obligatoire
          longueurMax={LONGUEURS_CLIENT.raisonSociale}
          {...champ('raisonSociale')}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <ChampSaisie
          libelle={professionnel ? 'Nom du contact' : 'Nom'}
          obligatoire={!professionnel}
          longueurMax={LONGUEURS_CLIENT.nom}
          {...champ('nomClient')}
        />
        <ChampSaisie
          libelle={professionnel ? 'Prénom du contact' : 'Prénom'}
          longueurMax={LONGUEURS_CLIENT.nom}
          {...champ('prenomClient')}
        />
      </div>
      <ChampSaisie
        libelle="Téléphone"
        obligatoire
        type="tel"
        inputMode="tel"
        aide="10 chiffres commençant par 0 ; espaces et points acceptés."
        longueurMax={LONGUEURS_CLIENT.telephoneSaisi}
        {...champ('telephone')}
      />
      <ChampSaisie
        libelle="E-mail"
        type="email"
        inputMode="email"
        longueurMax={LONGUEURS_CLIENT.email}
        {...champ('emailClient')}
      />
    </div>
  );
}

interface PropsType {
  typeClient: TypeClient;
  onChanger: (typeClient: TypeClient) => void;
  desactive: boolean;
  /** Posé sur le bouton coché : c'est lui qui reçoit le focus à l'ouverture. */
  refPremierChamp: Ref<HTMLInputElement>;
}

function ChoixDuType({ typeClient, onChanger, desactive, refPremierChamp }: PropsType) {
  const nom = useId();
  return (
    <fieldset>
      <legend className="text-xs font-medium">Type de client</legend>
      <div className="mt-1 flex flex-wrap gap-4">
        {TYPES.map((type) => (
          <label key={type} className="flex h-9 items-center gap-2 text-sm">
            <input
              ref={type === typeClient ? refPremierChamp : undefined}
              type="radio"
              name={nom}
              value={type}
              checked={type === typeClient}
              disabled={desactive}
              onChange={() => onChanger(type)}
              className="size-4 accent-sarcelle"
            />
            {LIBELLES_TYPE_CLIENT[type]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
