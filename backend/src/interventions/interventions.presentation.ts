import { depuisColonneDate } from '../commun/fuseau-metier.js';
import { StatutIntervention, TypeClient } from '../generated/prisma/client.ts';
import { calculerEmpreinte } from './empreinte-signature.js';
import type { InterventionDetaillee } from './intervention-detaillee.js';
import type { SignatureLue } from './interventions.repository.js';
import type { InterventionApi, SignatureApi } from './interventions.types.js';
import { versDataUrlPng } from './signature-png.js';

/*
 * Mise en forme d'une intervention selon le contrat d'API (section 6.3) : seuls les champs prévus
 * sortent de l'API, jamais une ligne Prisma telle quelle.
 */

// RG20 : une intervention planifiée non démarrée 15 minutes après son début prévu est en retard.
const TOLERANCE_DE_RETARD_MS = 15 * 60_000;

export function versInterventionApi(
  intervention: InterventionDetaillee,
  maintenant: Date,
): InterventionApi {
  const { adresse, tournee } = intervention;
  return {
    id: intervention.id,
    description: intervention.description,
    urgence: intervention.urgence,
    statut: intervention.statut,
    dureeEstimeeMin: intervention.dureeEstimeeMin,
    debutPrevu: intervention.debutPrevu,
    finPrevue: intervention.finPrevue,
    enRetard: estEnRetard(intervention, maintenant),
    ordreTournee: intervention.ordreTournee,
    compteRendu: intervention.compteRendu,
    motifAnnulation: intervention.motifAnnulation,
    demarreeLe: intervention.demarreeLe,
    termineeLe: intervention.termineeLe,
    annuleeLe: intervention.annuleeLe,
    creeLe: intervention.creeLe,
    majLe: intervention.majLe,
    type: { id: intervention.typeIntervention.id, libelle: intervention.typeIntervention.libelle },
    adresse: {
      id: adresse.id,
      rue: adresse.rue,
      complement: adresse.complement,
      codePostal: adresse.codePostal,
      ville: adresse.ville,
      infosAcces: adresse.infosAcces,
    },
    client: {
      id: adresse.client.id,
      typeClient: adresse.client.typeClient,
      nomAffiche: nomAffiche(adresse.client),
      telephone: adresse.client.telephone,
    },
    tournee:
      tournee === null
        ? null
        : {
            id: tournee.id,
            dateTournee: depuisColonneDate(tournee.dateTournee),
            technicien: {
              id: tournee.technicien.id,
              nom: tournee.technicien.utilisateur.nom,
              prenom: tournee.technicien.utilisateur.prenom,
            },
          },
    createur: intervention.createur,
    // Champs recopiés un par un : si le select s'élargit un jour, l'image ne sort pas pour autant.
    signature: intervention.signature
      ? {
          nomSignataire: intervention.signature.nomSignataire,
          signeeLe: intervention.signature.signeeLe,
        }
      : null,
  };
}

/**
 * GET /interventions/:id/signature. L'empreinte est recalculée avec les données actuelles,
 * dont le compte rendu de l'intervention (RG34). Un compte rendu effacé (null) ne peut pas
 * correspondre : une signature exige un compte rendu non vide (RG31).
 */
export function versSignatureApi(idIntervention: number, signature: SignatureLue): SignatureApi {
  const empreinteActuelle = calculerEmpreinte({
    idIntervention,
    compteRendu: signature.compteRendu ?? '',
    nomSignataire: signature.nomSignataire,
    signeeLe: signature.signeeLe,
    idAuteur: signature.auteur.id,
    image: signature.image,
  });
  return {
    nomSignataire: signature.nomSignataire,
    signeeLe: signature.signeeLe,
    auteur: { id: signature.auteur.id, nom: signature.auteur.nom, prenom: signature.auteur.prenom },
    empreinte: signature.empreinte,
    integre: empreinteActuelle === signature.empreinte,
    image: versDataUrlPng(signature.image),
  };
}

export function estEnRetard(
  { statut, debutPrevu }: Pick<InterventionDetaillee, 'statut' | 'debutPrevu'>,
  maintenant: Date,
): boolean {
  return (
    statut === StatutIntervention.PLANIFIEE &&
    debutPrevu !== null &&
    maintenant.getTime() > debutPrevu.getTime() + TOLERANCE_DE_RETARD_MS
  );
}

/** Nom et prénom pour un particulier, raison sociale pour un professionnel (contrat, 6.3). */
export function nomAffiche(client: InterventionDetaillee['adresse']['client']): string {
  if (client.typeClient === TypeClient.PROFESSIONNEL) {
    return client.raisonSociale ?? '';
  }
  return [client.prenomClient, client.nomClient].filter((morceau) => morceau !== null).join(' ');
}
