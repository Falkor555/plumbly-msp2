import type { Client } from '../api/types';
import { CELLULE_TABLEAU, ENTETE_TABLEAU, LIEN } from '../commun/classes';
import {
  BADGE,
  CLASSES_ARCHIVE,
  CLASSES_TYPE_CLIENT,
  LIBELLES_TYPE_CLIENT,
  telephoneLisible,
  villePrincipale,
} from './presentation';

interface Props {
  clients: Client[];
  /** Vrai pendant la lecture suivante : les lignes affichées sont celles de la précédente. */
  occupe: boolean;
}

/** US08 : une ligne par client, le nom menant à sa fiche. */
export function TableauClients({ clients, occupe }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bordure bg-white">
      <table className="w-full min-w-160 border-collapse text-left" aria-busy={occupe}>
        <caption className="sr-only">Clients : nom, ville, téléphone et type</caption>
        <thead>
          <tr className="border-b border-bordure bg-fond">
            <th scope="col" className={ENTETE_TABLEAU}>
              Nom
            </th>
            <th scope="col" className={ENTETE_TABLEAU}>
              Ville
            </th>
            <th scope="col" className={ENTETE_TABLEAU}>
              Téléphone
            </th>
            <th scope="col" className={ENTETE_TABLEAU}>
              Type
            </th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <LigneClient key={client.id} client={client} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LigneClient({ client }: { client: Client }) {
  const ville = villePrincipale(client);
  return (
    <tr className="border-b border-bordure last:border-b-0">
      <th scope="row" className={`${CELLULE_TABLEAU} font-semibold`}>
        <a href={`/clients/${client.id}`} className={LIEN}>
          {client.nomAffiche}
        </a>
        {client.archive && <span className={`${BADGE} ${CLASSES_ARCHIVE} ml-2`}>Archivé</span>}
      </th>
      <td className={CELLULE_TABLEAU}>
        {ville ?? <span className="text-gris-texte">Aucune adresse</span>}
      </td>
      <td className={`${CELLULE_TABLEAU} tabular-nums`}>{telephoneLisible(client.telephone)}</td>
      <td className={CELLULE_TABLEAU}>
        <span className={`${BADGE} ${CLASSES_TYPE_CLIENT[client.typeClient]}`}>
          {LIBELLES_TYPE_CLIENT[client.typeClient]}
        </span>
      </td>
    </tr>
  );
}
