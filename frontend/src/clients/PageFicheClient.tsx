import {
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { clientsApi } from '../api/clients.api';
import type { Adresse, Client } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { BOUTON_DESTRUCTIF, BOUTON_SECONDAIRE, LIEN as LIEN_TEXTE } from '../commun/classes';
import { dateMetier } from '../commun/dates';
import { lienTelephone } from '../commun/liens';
import { useChargement } from '../commun/useChargement';
import { useReessai } from '../commun/useReessai';
import { ZoneAnnonce } from '../commun/ZoneAnnonce';
import { type ActionFiche, FenetreDeLaFiche } from './FenetreDeLaFiche';
import { HistoriqueClient } from './HistoriqueClient';
import {
  BADGE,
  CLASSES_ARCHIVE,
  CLASSES_TYPE_CLIENT,
  identiteDuClient,
  LIBELLES_TYPE_CLIENT,
  separerAdresses,
  telephoneLisible,
} from './presentation';

const LIEN = `${LIEN_TEXTE} font-semibold`;
const CARTE = 'rounded-lg border border-bordure bg-white';

/** Message lu après chaque enregistrement réussi depuis la fiche. */
const ANNONCES: Record<ActionFiche['nom'], string> = {
  coordonnees: 'Coordonnées enregistrées.',
  'ajout-adresse': 'Adresse ajoutée.',
  'correction-adresse': 'Adresse corrigée.',
  'archivage-adresse': 'Adresse archivée.',
  'archivage-client': 'Client archivé : sa fiche est désormais en lecture seule.',
};

interface Props {
  /** Identifiant déjà validé par l'aiguillage (entier positif). */
  id: number;
}

/** US09 et US10 : fiche d'un client, archivé ou non, avec ses adresses et son historique. */
export function PageFicheClient({ id }: Props) {
  const charger = useCallback((signal: AbortSignal) => clientsApi.consulter(id, signal), [id]);
  const { etat, recharger, dernieresDonnees } = useChargement<Client>(charger);
  // Après une modification, la fiche relue remplace l'ancienne sans vider la page.
  const client = etat.statut === 'pret' ? etat.donnees : dernieresDonnees;
  const { zoneDeRepli, reessayer } = useReessai<HTMLElement>(recharger);

  return (
    // Bloc de repli du focus après « Réessayer » ; il n'est pas dans l'ordre de tabulation.
    <main
      ref={zoneDeRepli}
      tabIndex={-1}
      className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 focus:outline-none md:px-8"
    >
      <a href="/clients" className={`${LIEN} text-sm`}>
        Retour à la liste des clients
      </a>
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

/** Actions d'un client en service ; absentes pour un client archivé. */
interface ActionsDeLaFiche {
  ouvrir: (action: ActionFiche) => void;
  /**
   * Vrai pendant la relecture qui suit une écriture : la fiche affichée est périmée (adresse déjà
   * archivée, client déjà archivé) et une nouvelle action serait refusée par l'API.
   */
  inactives: boolean;
}

interface PropsContenu {
  client: Client;
  relectureEnCours: boolean;
  /** Une action a été enregistrée : la fiche est relue. */
  onModifie: () => void;
}

/** Un client archivé est en lecture seule : aucune action ne s'affiche (US10, RG22). */
function ContenuFiche({ client, relectureEnCours, onModifie }: PropsContenu) {
  const [action, setAction] = useState<ActionFiche | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const titreAdresses = useRef<HTMLHeadingElement>(null);
  const focaliserApresRelecture = useFocusApresRelecture(client);
  const actions: ActionsDeLaFiche | undefined = client.archive
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
      <Section
        titre="Coordonnées"
        action={
          actions && (
            <BoutonDeLaFiche actions={actions} action={{ nom: 'coordonnees' }}>
              Modifier les coordonnées
            </BoutonDeLaFiche>
          )
        }
      >
        <Coordonnees client={client} />
      </Section>
      <Section
        titre="Adresses"
        refTitre={titreAdresses}
        action={
          actions && (
            <BoutonDeLaFiche actions={actions} action={{ nom: 'ajout-adresse' }}>
              Ajouter une adresse
            </BoutonDeLaFiche>
          )
        }
      >
        <Adresses adresses={client.adresses} actions={actions} />
      </Section>
      <Section titre="Historique des interventions">
        <div className="px-4 py-4">
          <HistoriqueClient idClient={client.id} />
        </div>
      </Section>
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

interface PropsBouton {
  actions: ActionsDeLaFiche;
  /** Fenêtre que le bouton ouvre. */
  action: ActionFiche;
  destructif?: boolean;
  /** Raison propre au bouton de rester inactif (RG21), en plus d'une relecture en cours. */
  inactif?: boolean;
  /** Explication lue avec le bouton inactif. */
  idExplication?: string;
  children: ReactNode;
}

/**
 * Bouton d'action de la fiche. Inactif, il reste focalisable (aria-disabled) et n'ouvre rien : le
 * focus rendu par une fenêtre qui se ferme n'est ainsi jamais perdu pendant la relecture.
 */
function BoutonDeLaFiche({
  actions,
  action,
  destructif = false,
  inactif = false,
  idExplication,
  children,
}: PropsBouton) {
  const desactive = inactif || actions.inactives;
  return (
    <button
      type="button"
      aria-disabled={desactive || undefined}
      aria-describedby={idExplication}
      onClick={() => {
        if (!desactive) actions.ouvrir(action);
      }}
      className={destructif ? BOUTON_DESTRUCTIF : BOUTON_SECONDAIRE}
    >
      {children}
    </button>
  );
}

/**
 * Focus à poser une fois la fiche relue. Après un archivage, le bouton qui avait ouvert la fenêtre
 * disparaît avec la relecture : sans cela, le focus retomberait sur le document et l'utilisateur
 * au clavier devrait retraverser la page (RGAA 12.8). La cible est un titre resté en place.
 */
function useFocusApresRelecture(client: Client): (cible: RefObject<HTMLElement | null>) => void {
  const cibleEnAttente = useRef<RefObject<HTMLElement | null> | null>(null);
  useEffect(() => {
    // La fiche relue est un nouvel objet : l'effet ne passe qu'une fois la relecture arrivée.
    cibleEnAttente.current?.current?.focus();
    cibleEnAttente.current = null;
  }, [client]);
  return useCallback((cible) => {
    cibleEnAttente.current = cible;
  }, []);
}

interface PropsEnTete {
  client: Client;
  refTitre: Ref<HTMLHeadingElement>;
  /** Absentes pour un client archivé. */
  actions?: ActionsDeLaFiche;
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

interface PropsSection {
  titre: string;
  /** Bouton d'action placé à droite du titre. */
  action?: ReactNode;
  /** Posé avec tabIndex={-1} : le titre peut alors recevoir le focus. */
  refTitre?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}

function Section({ titre, action, refTitre, children }: PropsSection) {
  const idTitre = useId();
  return (
    <section aria-labelledby={idTitre} className={CARTE}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordure px-4 py-3">
        <h2
          ref={refTitre}
          id={idTitre}
          tabIndex={refTitre ? -1 : undefined}
          className="text-lg font-semibold focus:outline-none"
        >
          {titre}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Rubrique({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gris-texte">{titre}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const NON_RENSEIGNE = <span className="text-gris-texte">Non renseigné</span>;

function Coordonnees({ client }: { client: Client }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {identiteDuClient(client).map(({ titre, valeur }) => (
        <Rubrique key={titre} titre={titre}>
          {valeur ?? NON_RENSEIGNE}
        </Rubrique>
      ))}
      <Rubrique titre="Téléphone">
        <a href={lienTelephone(client.telephone)} className={`${LIEN} tabular-nums`}>
          {telephoneLisible(client.telephone)}
        </a>
      </Rubrique>
      <Rubrique titre="E-mail">
        {client.emailClient ? (
          <a href={`mailto:${client.emailClient}`} className={`${LIEN} break-all`}>
            {client.emailClient}
          </a>
        ) : (
          NON_RENSEIGNE
        )}
      </Rubrique>
    </dl>
  );
}

/** Les adresses archivées restent visibles à part : l'historique peut encore les citer (RG22). */
function Adresses({ adresses, actions }: { adresses: Adresse[]; actions?: ActionsDeLaFiche }) {
  const { enService, archivees } = separerAdresses(adresses);
  return (
    <div className="space-y-4 px-4 py-4">
      <ListeAdresses
        titre="En service"
        adresses={enService}
        actions={actions}
        derniereEnService={enService.length <= 1}
      />
      {archivees.length > 0 && <ListeAdresses titre="Archivées" adresses={archivees} />}
    </div>
  );
}

interface PropsListe {
  titre: string;
  adresses: Adresse[];
  actions?: ActionsDeLaFiche;
  /** RG21 : il ne reste qu'une adresse en service, qui ne peut donc pas être archivée. */
  derniereEnService?: boolean;
}

function ListeAdresses({ titre, adresses, actions, derniereEnService = false }: PropsListe) {
  const idTitre = useId();
  return (
    <div>
      <h3 id={idTitre} className="text-sm font-semibold">
        {titre} ({adresses.length})
      </h3>
      {adresses.length === 0 ? (
        <p className="mt-2 text-sm text-gris-texte">Aucune adresse en service.</p>
      ) : (
        <ul aria-labelledby={idTitre} className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {adresses.map((adresse) => (
            <CarteAdresse key={adresse.id} adresse={adresse}>
              {actions && (
                <ActionsDeLAdresse
                  adresse={adresse}
                  actions={actions}
                  derniereEnService={derniereEnService}
                />
              )}
            </CarteAdresse>
          ))}
        </ul>
      )}
    </div>
  );
}

function CarteAdresse({ adresse, children }: { adresse: Adresse; children?: ReactNode }) {
  return (
    <li className="rounded border border-bordure px-3 py-2 text-sm">
      <p className="font-semibold">{adresse.rue}</p>
      {adresse.complement && <p>{adresse.complement}</p>}
      <p>
        {adresse.codePostal} {adresse.ville}
      </p>
      {adresse.infosAcces && <p className="mt-1 text-gris-texte">Accès : {adresse.infosAcces}</p>}
      {adresse.archive && adresse.archiveLe && (
        <p className="mt-1 text-gris-texte">Archivée le {dateMetier(adresse.archiveLe)}</p>
      )}
      {children}
    </li>
  );
}

interface PropsActionsAdresse {
  adresse: Adresse;
  actions: ActionsDeLaFiche;
  derniereEnService: boolean;
}

/**
 * « Corriger » et « Archiver », nommés avec la rue pour les distinguer d'une carte à l'autre. Sur
 * la dernière adresse en service, « Archiver » reste focalisable mais inactif : son explication est
 * ainsi lue au clavier, au lieu d'un refus de l'API après coup (RG21).
 */
function ActionsDeLAdresse({ adresse, actions, derniereEnService }: PropsActionsAdresse) {
  const idExplication = useId();
  // L'espace hors du span : le nom accessible collerait sinon « Corrigerl’adresse ».
  const precision = (
    <>
      {' '}
      <span className="sr-only">l’adresse {adresse.rue}</span>
    </>
  );
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <BoutonDeLaFiche actions={actions} action={{ nom: 'correction-adresse', adresse }}>
          Corriger{precision}
        </BoutonDeLaFiche>
        <BoutonDeLaFiche
          actions={actions}
          action={{ nom: 'archivage-adresse', adresse }}
          destructif
          inactif={derniereEnService}
          idExplication={derniereEnService ? idExplication : undefined}
        >
          Archiver{precision}
        </BoutonDeLaFiche>
      </div>
      {derniereEnService && (
        <p id={idExplication} className="mt-1 text-xs text-gris-texte">
          Dernière adresse en service : ajoutez-en une autre avant de l’archiver.
        </p>
      )}
    </div>
  );
}
