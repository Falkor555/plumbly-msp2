import type { ReactNode } from 'react';
import type { Client } from '../api/types';
import { lienTelephone } from '../commun/liens';
import { type ActionsDeLaFiche, BoutonDeLaFiche, LIEN_FICHE, Section } from './ElementsDeLaFiche';
import { identiteDuClient, telephoneLisible } from './presentation';

const NON_RENSEIGNE = <span className="text-gris-texte">Non renseigné</span>;

interface Props {
  client: Client;
  /** Absentes pour un client archivé : ses coordonnées ne se modifient plus (RG22). */
  actions?: ActionsDeLaFiche;
}

/** Coordonnées du client (US09), modifiables tant qu'il est en service (US10). */
export function SectionCoordonnees({ client, actions }: Props) {
  return (
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
      <dl className="grid gap-x-6 gap-y-3 px-4 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {identiteDuClient(client).map(({ titre, valeur }) => (
          <Rubrique key={titre} titre={titre}>
            {valeur ?? NON_RENSEIGNE}
          </Rubrique>
        ))}
        <Rubrique titre="Téléphone">
          <a href={lienTelephone(client.telephone)} className={`${LIEN_FICHE} tabular-nums`}>
            {telephoneLisible(client.telephone)}
          </a>
        </Rubrique>
        <Rubrique titre="E-mail">
          {client.emailClient ? (
            <a href={`mailto:${client.emailClient}`} className={`${LIEN_FICHE} break-all`}>
              {client.emailClient}
            </a>
          ) : (
            NON_RENSEIGNE
          )}
        </Rubrique>
      </dl>
    </Section>
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
