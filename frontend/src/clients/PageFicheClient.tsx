import { type Ref, useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { clientsApi } from '../api/clients.api';
import type { Client } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { BADGE, CLASSES_ARCHIVE } from '../commun/classes';
import { dateMetier } from '../commun/dates';
import { type ActionsDeLaFiche, BoutonDeLaFiche, LIEN_FICHE } from '../commun/ElementsDeLaFiche';
import { lireIdentifiant } from '../commun/identifiant';
import { PageIntrouvable } from '../commun/PageIntrouvable';
import { useArriveeSurLaPage } from '../commun/useArriveeSurLaPage';
import { useChargement } from '../commun/useChargement';
import { useFocusApresRelecture } from '../commun/useFocusApresRelecture';
import { useReessai } from '../commun/useReessai';
import { ZoneAnnonce } from '../commun/ZoneAnnonce';
import { type ActionFiche, FenetreDeLaFiche } from './FenetreDeLaFiche';
import { CLASSES_TYPE_CLIENT, LIBELLES_TYPE_CLIENT } from './presentation';
import { SectionAdresses } from './SectionAdresses';
import { SectionCoordonnees } from './SectionCoordonnees';
import { SectionHistorique } from './SectionHistorique';

/** Message lu après chaque enregistrement réussi depuis la fiche. */
const ANNONCES: Record<ActionFiche['nom'], string> = {
  coordonnees: 'Coordonnées enregistrées.',
  'ajout-adresse': 'Adresse ajoutée.',
  'correction-adresse': 'Adresse corrigée.',
  'archivage-adresse': 'Adresse archivée.',
  'archivage-client': 'Client archivé : sa fiche est désormais en lecture seule.',
};

/** US09 et US10 : fiche du client désigné par l'adresse /clients/:id. */
export function PageFicheClient() {
  const { id } = useParams();
  const identifiant = id === undefined ? null : lireIdentifiant(id);
  if (identifiant === null) {
    return (
      <PageIntrouvable retour={{ vers: '/clients', libelle: 'Retour à la liste des clients' }} />
    );
  }
  // La clé repart d'un état neuf quand l'historique du navigateur passe d'une fiche à une autre :
  // sans elle, la fiche précédente et son message de succès resteraient affichés pendant la lecture.
  return <FicheClient key={identifiant} id={identifiant} />;
}

interface Props {
  /** Identifiant validé : entier positif dans les bornes de l'API. */
  id: number;
}

/** Fiche d'un client, archivé ou non, avec ses adresses et son historique. */
function FicheClient({ id }: Props) {
  const charger = useCallback((signal: AbortSignal) => clientsApi.consulter(id, signal), [id]);
  const { etat, recharger, dernieresDonnees } = useChargement<Client>(charger);
  // Après une modification, la fiche relue remplace l'ancienne sans vider la page.
  const client = etat.statut === 'pret' ? etat.donnees : dernieresDonnees;
  const { zoneDeRepli, reessayer } = useReessai<HTMLElement>(recharger);
  useArriveeSurLaPage(zoneDeRepli);

  return (
    // Cible du focus à l'arrivée et après « Réessayer » ; hors de l'ordre de tabulation.
    <main
      ref={zoneDeRepli}
      tabIndex={-1}
      className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 focus:outline-none md:px-8"
    >
      <Link to="/clients" className={`${LIEN_FICHE} text-sm`}>
        Retour à la liste des clients
      </Link>
      {etat.statut !== 'erreur' && client ? (
        <ContenuFiche
          client={client}
          relectureEnCours={etat.statut === 'chargement'}
          onModifie={recharger}
        />
      ) : (
        // Tant que le nom n'est pas connu, la page garde un titre de niveau 1 générique.
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Fiche client</h1>
          {etat.statut === 'erreur' ? (
            <AlerteChargement message={etat.message} onReessayer={reessayer} />
          ) : (
            <p role="status" className="text-sm text-gris-texte">
              Chargement de la fiche du client…
            </p>
          )}
        </>
      )}
    </main>
  );
}

interface PropsContenu {
  client: Client;
  relectureEnCours: boolean;
  /** Une action a été enregistrée : la fiche est relue. */
  onModifie: () => void;
}

/**
 * Assemble la fiche et garde l'état partagé par ses sections : la fenêtre ouverte, le message de
 * succès et le focus à rendre après la relecture. Un client archivé est en lecture seule : aucune
 * action ne s'affiche (US10, RG22).
 */
function ContenuFiche({ client, relectureEnCours, onModifie }: PropsContenu) {
  const [action, setAction] = useState<ActionFiche | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const titreAdresses = useRef<HTMLHeadingElement>(null);
  const focaliserApresRelecture = useFocusApresRelecture(client);
  const actions: ActionsDeLaFiche<ActionFiche> | undefined = client.archive
    ? undefined
    : {
        ouvrir: (choisie) => {
          setAnnonce(null);
          setAction(choisie);
        },
        inactives: relectureEnCours,
      };

  function terminer(terminee: ActionFiche) {
    setAction(null);
    setAnnonce(ANNONCES[terminee.nom]);
    if (terminee.nom === 'archivage-client') focaliserApresRelecture(titre);
    if (terminee.nom === 'archivage-adresse') focaliserApresRelecture(titreAdresses);
    onModifie();
  }

  return (
    <>
      <EnTeteFiche client={client} refTitre={titre} actions={actions} />
      <ZoneAnnonce>{annonce}</ZoneAnnonce>
      <SectionCoordonnees client={client} actions={actions} />
      <SectionAdresses adresses={client.adresses} actions={actions} refTitre={titreAdresses} />
      <SectionHistorique idClient={client.id} />
      {action && (
        <FenetreDeLaFiche
          action={action}
          client={client}
          onAnnuler={() => setAction(null)}
          onTermine={() => terminer(action)}
        />
      )}
    </>
  );
}

interface PropsEnTete {
  client: Client;
  refTitre: Ref<HTMLHeadingElement>;
  /** Absentes pour un client archivé. */
  actions?: ActionsDeLaFiche<ActionFiche>;
}

function EnTeteFiche({ client, refTitre, actions }: PropsEnTete) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Cible du focus après l'archivage, hors de l'ordre de tabulation. */}
          <h1
            ref={refTitre}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight focus:outline-none"
          >
            {client.nomAffiche}
          </h1>
          <span className={`${BADGE} ${CLASSES_TYPE_CLIENT[client.typeClient]}`}>
            {LIBELLES_TYPE_CLIENT[client.typeClient]}
          </span>
          {client.archive && <span className={`${BADGE} ${CLASSES_ARCHIVE}`}>Archivé</span>}
        </div>
        {client.archive && client.archiveLe && (
          <p className="rounded border border-bordure bg-gray-100 px-3 py-2 text-sm text-gris-texte">
            Client archivé le {dateMetier(client.archiveLe)} : il n’apparaît plus dans les listes ni
            les recherches, mais sa fiche et son historique restent consultables.
          </p>
        )}
      </div>
      {actions && (
        <BoutonDeLaFiche actions={actions} action={{ nom: 'archivage-client' }} destructif>
          Archiver le client
        </BoutonDeLaFiche>
      )}
    </header>
  );
}
