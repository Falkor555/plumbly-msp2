import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Intervention } from '../api/types';
import { lienTelephone } from '../commun/liens';
import { BadgesIntervention } from './BadgesIntervention';
import { creneau } from './presentation';

interface Props {
  intervention: Intervention;
  onFermer: () => void;
}

/**
 * US23 : détail d'une intervention du planning, en lecture seule. Construit avec les données
 * du planning déjà chargé : aucun appel à l'API.
 */
export function FenetreDetailIntervention({ intervention, onFermer }: Props) {
  const idTitre = useId();
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const { client, adresse } = intervention;

  useEffect(() => {
    // Le focus revient à l'intervention cliquée, pour reprendre la lecture du planning au même endroit.
    const elementDOrigine = document.activeElement;
    boutonFermer.current?.focus();
    return () => {
      if (elementDOrigine instanceof HTMLElement) elementDOrigine.focus();
    };
  }, []);

  useEffect(() => {
    function fermerAvecEchap(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape') onFermer();
    }
    document.addEventListener('keydown', fermerAvecEchap);
    return () => document.removeEventListener('keydown', fermerAvecEchap);
  }, [onFermer]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-anthracite/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        className="w-full max-w-lg rounded-xl border border-bordure bg-white shadow-[0_4px_6px_-1px_rgb(31_41_55/0.08),0_2px_4px_-2px_rgb(31_41_55/0.06)]"
      >
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
          </Rubrique>
          {adresse.infosAcces && <Rubrique titre="Accès">{adresse.infosAcces}</Rubrique>}
          <Rubrique titre="Description">{intervention.description}</Rubrique>
        </dl>
      </div>
    </div>
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
