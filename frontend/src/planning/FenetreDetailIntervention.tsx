import { useId, useRef, type ReactNode } from 'react';
import type { Intervention } from '../api/types';
import { Fenetre } from '../commun/Fenetre';
import { lienTelephone } from '../commun/liens';
import { LienItineraire } from '../commun/LiensContact';
import { BlocSignature } from '../signature/BlocSignature';
import { BadgesIntervention } from './BadgesIntervention';
import { creneau } from './presentation';

interface Props {
  intervention: Intervention;
  onFermer: () => void;
}

/**
 * US23 : détail d'une intervention du planning, en lecture seule. Construit avec les données
 * du planning déjà chargé, sauf la signature du client (US33) : pour une intervention signée,
 * le bloc « Signature du client » la lit à l'ouverture (GET /interventions/:id/signature), car
 * l'image n'est jamais dans le planning. Une intervention non signée ne fait aucun appel.
 */
export function FenetreDetailIntervention({ intervention, onFermer }: Props) {
  const idTitre = useId();
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const { client, adresse } = intervention;

  return (
    <Fenetre idTitre={idTitre} onFermer={onFermer} focusInitial={boutonFermer}>
      <header className="flex items-start gap-3 border-b border-bordure px-6 py-4">
        <div className="min-w-0 flex-1">
          <h2 id={idTitre} className="text-lg font-semibold">
            {intervention.type.libelle}
          </h2>
          <p className="text-sm text-gris-texte tabular-nums">{creneau(intervention)}</p>
          <div className="mt-1">
            <BadgesIntervention intervention={intervention} />
          </div>
        </div>
        <button
          ref={boutonFermer}
          type="button"
          onClick={onFermer}
          className="h-9 rounded border border-gray-300 bg-white px-3 text-sm font-semibold hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle"
        >
          Fermer
        </button>
      </header>

      <dl className="space-y-3 px-6 py-4 text-sm">
        <Rubrique titre="Client">
          {client.nomAffiche}
          <a
            href={lienTelephone(client.telephone)}
            className="block font-semibold text-sarcelle-profonde underline"
          >
            {client.telephone}
          </a>
        </Rubrique>
        <Rubrique titre="Adresse">
          <address className="not-italic">
            {adresse.rue}
            {adresse.complement && <span className="block">{adresse.complement}</span>}
            <span className="block">
              {adresse.codePostal} {adresse.ville}
            </span>
          </address>
          <span className="mt-2 block">
            <LienItineraire adresse={adresse} />
          </span>
        </Rubrique>
        {adresse.infosAcces && <Rubrique titre="Accès">{adresse.infosAcces}</Rubrique>}
        <Rubrique titre="Description">{intervention.description}</Rubrique>
      </dl>
      {intervention.signature && (
        <div className="border-t border-bordure px-6 py-4">
          <BlocSignature idIntervention={intervention.id} />
        </div>
      )}
    </Fenetre>
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
