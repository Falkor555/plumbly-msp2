import { useCallback, useId, type ReactNode } from 'react';
import { clientsApi } from '../api/clients.api';
import type { Adresse, Client } from '../api/types';
import { AlerteChargement } from '../commun/AlerteChargement';
import { LIEN as LIEN_TEXTE } from '../commun/classes';
import { dateMetier } from '../commun/dates';
import { lienTelephone } from '../commun/liens';
import { useChargement } from '../commun/useChargement';
import { useReessai } from '../commun/useReessai';
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
const TITRE_SECTION = 'border-b border-bordure px-4 py-3 text-lg font-semibold';

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
        <ContenuFiche client={client} />
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

function ContenuFiche({ client }: { client: Client }) {
  return (
    <>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{client.nomAffiche}</h1>
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
      </header>
      <Section titre="Coordonnées">
        <Coordonnees client={client} />
      </Section>
      <Section titre="Adresses">
        <Adresses adresses={client.adresses} />
      </Section>
      <Section titre="Historique des interventions">
        <div className="px-4 py-4">
          <HistoriqueClient idClient={client.id} />
        </div>
      </Section>
    </>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  const idTitre = useId();
  return (
    <section aria-labelledby={idTitre} className={CARTE}>
      <h2 id={idTitre} className={TITRE_SECTION}>
        {titre}
      </h2>
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
function Adresses({ adresses }: { adresses: Adresse[] }) {
  const { enService, archivees } = separerAdresses(adresses);
  return (
    <div className="space-y-4 px-4 py-4">
      <ListeAdresses titre="En service" adresses={enService} />
      {archivees.length > 0 && <ListeAdresses titre="Archivées" adresses={archivees} />}
    </div>
  );
}

function ListeAdresses({ titre, adresses }: { titre: string; adresses: Adresse[] }) {
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
            <CarteAdresse key={adresse.id} adresse={adresse} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CarteAdresse({ adresse }: { adresse: Adresse }) {
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
    </li>
  );
}
