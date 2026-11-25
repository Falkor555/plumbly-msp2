import { type ReactNode, type Ref, useId } from 'react';
import type { Adresse } from '../api/types';
import { dateMetier } from '../commun/dates';
import { type ActionsDeLaFiche, BoutonDeLaFiche, Section } from './ElementsDeLaFiche';
import { separerAdresses } from './presentation';

interface Props {
  adresses: Adresse[];
  /** Absentes pour un client archivé : ses adresses ne se modifient plus (RG22). */
  actions?: ActionsDeLaFiche;
  /** Titre de la section, cible du focus après l'archivage d'une adresse. */
  refTitre: Ref<HTMLHeadingElement>;
}

/**
 * Adresses d'intervention du client (US09, US10). Les adresses archivées restent visibles à part :
 * l'historique peut encore les citer (RG22).
 */
export function SectionAdresses({ adresses, actions, refTitre }: Props) {
  const { enService, archivees } = separerAdresses(adresses);
  return (
    <Section
      titre="Adresses"
      refTitre={refTitre}
      action={
        actions && (
          <BoutonDeLaFiche actions={actions} action={{ nom: 'ajout-adresse' }}>
            Ajouter une adresse
          </BoutonDeLaFiche>
        )
      }
    >
      <div className="space-y-4 px-4 py-4">
        <ListeAdresses
          titre="En service"
          adresses={enService}
          actions={actions}
          derniereEnService={enService.length <= 1}
        />
        {archivees.length > 0 && <ListeAdresses titre="Archivées" adresses={archivees} />}
      </div>
    </Section>
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
