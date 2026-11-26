import { useCallback, useId } from 'react';
import { interventionsApi } from '../api/interventions.api';
import { heureMetier, jourMetier, libelleJourLong } from '../commun/dates';
import { useChargement } from '../commun/useChargement';
import { nomComplet } from '../planning/presentation';

const BADGE =
  'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset';

/*
 * L'image vient de l'API, qui n'accepte que des PNG (RG35). Elle n'est affichée que sous cette
 * forme : une autre adresse dans src ne serait jamais chargée par l'écran.
 */
const PREFIXE_IMAGE_PNG = 'data:image/png;base64,';

interface Props {
  idIntervention: number;
}

/**
 * US33 et RG34 : signature du client d'une intervention signée, lue à l'affichage avec
 * GET /interventions/:id/signature (l'image n'est jamais dans les listes). Le badge dit si le
 * contenu signé, dont le compte rendu, est resté tel quel depuis la signature.
 */
export function BlocSignature({ idIntervention }: Props) {
  const idTitre = useId();
  const charger = useCallback(
    (signal: AbortSignal) => interventionsApi.lireSignature(idIntervention, signal),
    [idIntervention],
  );
  const { etat } = useChargement(charger);

  return (
    <section aria-labelledby={idTitre} className="space-y-2 text-sm">
      <h3 id={idTitre} className="text-sm font-semibold">
        Signature du client
      </h3>
      {etat.statut === 'chargement' && (
        <p className="text-gris-texte">Chargement de la signature…</p>
      )}
      {etat.statut === 'erreur' && (
        <p role="alert" className="text-erreur-texte">
          {etat.message}
        </p>
      )}
      {etat.statut === 'pret' && (
        <>
          {etat.donnees.integre ? (
            <span className={`${BADGE} bg-succes-fond text-green-800 ring-succes/20`}>
              Contenu intact
            </span>
          ) : (
            <p className="space-y-1">
              <span className={`${BADGE} bg-erreur-fond text-erreur-texte ring-erreur/20`}>
                Contenu modifié après signature
              </span>
              <span className="block text-xs text-gris-texte">
                Le compte rendu ou la signature ne correspondent plus à ce que le client a signé.
              </span>
            </p>
          )}
          {etat.donnees.image.startsWith(PREFIXE_IMAGE_PNG) ? (
            <img
              src={etat.donnees.image}
              alt={`Signature de ${etat.donnees.nomSignataire}`}
              className="block aspect-[3/1] w-full max-w-sm rounded border border-bordure bg-white object-contain"
            />
          ) : (
            <p className="text-gris-texte">Image de la signature illisible.</p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-gris-texte">Signataire</dt>
            <dd className="font-semibold">{etat.donnees.nomSignataire}</dd>
            <dt className="text-gris-texte">Signée le</dt>
            <dd className="tabular-nums">
              {libelleJourLong(jourMetier(etat.donnees.signeeLe))} à{' '}
              {heureMetier(etat.donnees.signeeLe)}
            </dd>
            <dt className="text-gris-texte">Technicien</dt>
            <dd>{nomComplet(etat.donnees.auteur)}</dd>
          </dl>
        </>
      )}
    </section>
  );
}
