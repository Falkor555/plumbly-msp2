import type { Ref } from 'react';
import { ChampSaisie } from '../commun/ChampSaisie';
import type { ErreursSaisie } from '../commun/saisie';
import { LONGUEURS_CLIENT, type SaisieAdresse } from './validationClient';

interface Props {
  saisie: SaisieAdresse;
  erreurs: ErreursSaisie<SaisieAdresse>;
  onChanger: (champ: keyof SaisieAdresse, valeur: string) => void;
  desactive: boolean;
  /** Reçoit la rue, premier champ, quand la fenêtre n'a que l'adresse à saisir. */
  refPremierChamp?: Ref<HTMLInputElement>;
}

/**
 * Champs d’une adresse d’intervention (US06, US07), partagés par la création et la correction.
 * Pas d’autocomplétion : le navigateur proposerait les coordonnées du gestionnaire, pas du client.
 */
export function ChampsAdresse({ saisie, erreurs, onChanger, desactive, refPremierChamp }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      <ChampSaisie
        ref={refPremierChamp}
        libelle="Rue"
        obligatoire
        valeur={saisie.rue}
        onChanger={(valeur) => onChanger('rue', valeur)}
        erreur={erreurs.rue}
        longueurMax={LONGUEURS_CLIENT.rue}
        desactive={desactive}
        className="sm:col-span-2"
      />
      <ChampSaisie
        libelle="Complément d’adresse"
        aide="Bâtiment, résidence, lieu-dit."
        valeur={saisie.complement}
        onChanger={(valeur) => onChanger('complement', valeur)}
        erreur={erreurs.complement}
        longueurMax={LONGUEURS_CLIENT.complement}
        desactive={desactive}
        className="sm:col-span-2"
      />
      <ChampSaisie
        libelle="Code postal"
        obligatoire
        valeur={saisie.codePostal}
        onChanger={(valeur) => onChanger('codePostal', valeur)}
        erreur={erreurs.codePostal}
        longueurMax={LONGUEURS_CLIENT.codePostal}
        inputMode="numeric"
        desactive={desactive}
      />
      <ChampSaisie
        libelle="Ville"
        obligatoire
        valeur={saisie.ville}
        onChanger={(valeur) => onChanger('ville', valeur)}
        erreur={erreurs.ville}
        longueurMax={LONGUEURS_CLIENT.ville}
        desactive={desactive}
      />
      <ChampSaisie
        libelle="Informations d’accès"
        aide="Digicode, étage, consignes pour le technicien."
        valeur={saisie.infosAcces}
        onChanger={(valeur) => onChanger('infosAcces', valeur)}
        erreur={erreurs.infosAcces}
        longueurMax={LONGUEURS_CLIENT.infosAcces}
        desactive={desactive}
        className="sm:col-span-2"
      />
    </div>
  );
}
