import { clientsApi } from '../api/clients.api';
import type { Adresse, Client } from '../api/types';
import { FenetreConfirmation } from '../commun/FenetreConfirmation';
import { FenetreAdresse } from './FenetreAdresse';
import { FenetreClient } from './FenetreClient';
import { adresseSurUneLigne } from './presentation';

/** Action de la fiche qui ouvre une fenêtre. */
export type ActionFiche =
  | { nom: 'coordonnees' }
  | { nom: 'ajout-adresse' }
  | { nom: 'correction-adresse'; adresse: Adresse }
  | { nom: 'archivage-adresse'; adresse: Adresse }
  | { nom: 'archivage-client' };

interface Props {
  action: ActionFiche;
  client: Client;
  onAnnuler: () => void;
  /** L'API a enregistré l'action : la fiche se ferme et se relit. */
  onTermine: () => void;
}

// Aucune route ne désarchive un client ni une adresse (docs/api.md, 6.5).
const DEFINITIF = (
  <p className="font-semibold">L’archivage est définitif : il ne peut pas être annulé.</p>
);

/** Fenêtre ouverte par une action de la fiche client (US07, US10). */
export function FenetreDeLaFiche({ action, client, onAnnuler, onTermine }: Props) {
  switch (action.nom) {
    case 'coordonnees':
      return <FenetreClient client={client} onFermer={onAnnuler} onEnregistre={onTermine} />;
    case 'ajout-adresse':
    case 'correction-adresse':
      return (
        <FenetreAdresse
          idClient={client.id}
          adresse={action.nom === 'correction-adresse' ? action.adresse : undefined}
          onFermer={onAnnuler}
          onEnregistree={onTermine}
        />
      );
    case 'archivage-adresse':
      return (
        <ConfirmationArchivageAdresse
          client={client}
          adresse={action.adresse}
          onAnnuler={onAnnuler}
          onTermine={onTermine}
        />
      );
    case 'archivage-client':
      return (
        <ConfirmationArchivageClient client={client} onAnnuler={onAnnuler} onTermine={onTermine} />
      );
  }
}

type PropsConfirmation = Omit<Props, 'action'>;

/** US10 et RG22 : refusé (409) tant que le client a des interventions actives. */
function ConfirmationArchivageClient({ client, onAnnuler, onTermine }: PropsConfirmation) {
  return (
    <FenetreConfirmation
      titre="Archiver le client ?"
      message={
        <>
          <p>
            « {client.nomAffiche} » n’apparaîtra plus dans les listes ni les recherches. Sa fiche et
            son historique resteront consultables, sans modification possible.
          </p>
          {DEFINITIF}
        </>
      }
      libelleConfirmer="Archiver définitivement"
      libelleEnCours="Archivage en cours…"
      contexteErreur="Archivage du client impossible"
      onConfirmer={async () => {
        await clientsApi.archiver(client.id);
        onTermine();
      }}
      onAnnuler={onAnnuler}
    />
  );
}

/** US07 et RG21 : refusé (409) tant que l'adresse a des interventions actives. */
function ConfirmationArchivageAdresse({
  client,
  adresse,
  onAnnuler,
  onTermine,
}: PropsConfirmation & { adresse: Adresse }) {
  return (
    <FenetreConfirmation
      titre="Archiver l’adresse ?"
      message={
        <>
          <p>
            « {adresseSurUneLigne(adresse)} » ne sera plus proposée pour de nouvelles interventions.
            Elle restera dans l’historique du client.
          </p>
          {DEFINITIF}
        </>
      }
      libelleConfirmer="Archiver l’adresse"
      libelleEnCours="Archivage en cours…"
      contexteErreur="Archivage de l’adresse impossible"
      onConfirmer={async () => {
        await clientsApi.archiverAdresse(client.id, adresse.id);
        onTermine();
      }}
      onAnnuler={onAnnuler}
    />
  );
}
