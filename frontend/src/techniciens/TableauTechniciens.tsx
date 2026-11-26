import { Link } from 'react-router';
import type { FicheTechnicien } from '../api/types';
import { BADGE, CELLULE_TABLEAU, CLASSES_ARCHIVE, ENTETE_TABLEAU, LIEN } from '../commun/classes';
import { telephoneLisible } from '../commun/telephone';
import { nomComplet } from '../planning/presentation';
import { PastilleCouleur } from './PastilleCouleur';
import { initiales } from './presentation';

interface Props {
  techniciens: FicheTechnicien[];
  /** Vrai pendant la lecture suivante : les lignes affichées sont celles de la précédente. */
  occupe: boolean;
}

/** US11 : une ligne par technicien, son nom menant à sa fiche. */
export function TableauTechniciens({ techniciens, occupe }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-bordure bg-white">
      <table className="w-full min-w-160 border-collapse text-left" aria-busy={occupe}>
        <caption className="sr-only">Techniciens : nom, e-mail et téléphone</caption>
        <thead>
          <tr className="border-b border-bordure bg-fond">
            <th scope="col" className={ENTETE_TABLEAU}>
              Nom
            </th>
            <th scope="col" className={ENTETE_TABLEAU}>
              E-mail
            </th>
            <th scope="col" className={ENTETE_TABLEAU}>
              Téléphone
            </th>
          </tr>
        </thead>
        <tbody>
          {techniciens.map((technicien) => (
            <LigneTechnicien key={technicien.id} technicien={technicien} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** La pastille reprend la couleur du planning : on reconnaît le technicien d'un écran à l'autre. */
function LigneTechnicien({ technicien }: { technicien: FicheTechnicien }) {
  return (
    <tr className="border-b border-bordure last:border-b-0">
      <th scope="row" className={`${CELLULE_TABLEAU} font-semibold`}>
        <span className="flex flex-wrap items-center gap-2">
          <PastilleCouleur couleur={technicien.couleurPlanning} texte={initiales(technicien)} />
          <Link to={`/techniciens/${technicien.id}`} className={LIEN}>
            {nomComplet(technicien)}
          </Link>
          {technicien.archive && <span className={`${BADGE} ${CLASSES_ARCHIVE}`}>Archivé</span>}
          {!technicien.compteActif && (
            <span className={`${BADGE} ${CLASSES_ARCHIVE}`}>Compte désactivé</span>
          )}
        </span>
      </th>
      <td className={`${CELLULE_TABLEAU} break-all`}>{technicien.email}</td>
      <td className={`${CELLULE_TABLEAU} tabular-nums`}>
        {telephoneLisible(technicien.telephone)}
      </td>
    </tr>
  );
}
