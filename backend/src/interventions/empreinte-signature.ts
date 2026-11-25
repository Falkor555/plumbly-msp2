import { createHash } from 'node:crypto';

/*
 * Empreinte SHA-256 du contenu signé par le client (US33, RG34, ADR 0013).
 *
 * Ce qu'elle détecte : une modification après la signature, faite par l'application ou par
 * erreur (compte rendu réécrit en SQL, nom changé, image remplacée, date ou auteur modifiés).
 * L'empreinte est recalculée à chaque lecture et comparée à celle enregistrée.
 *
 * Ce qu'elle ne détecte pas : une falsification par quelqu'un qui a un accès direct à la base,
 * car il peut recalculer l'empreinte avec cette formule publique, ou supprimer la ligne et en
 * insérer une autre (le déclencheur ne bloque que UPDATE, pour permettre l'anonymisation). Une
 * empreinte HMAC avec une clé serveur est l'évolution prévue par l'ADR.
 */

// Change si la formule change : une empreinte se recalcule toujours avec sa propre version.
const VERSION_DE_LA_FORMULE = 'plumbly-signature-v1';

/** Valeurs telles qu'enregistrées en base (textes déjà débarrassés de leurs espaces). */
export interface ContenuSigne {
  idIntervention: number;
  compteRendu: string;
  nomSignataire: string;
  signeeLe: Date;
  idAuteur: number;
  image: Uint8Array;
}

/** SHA-256 en hexadécimal minuscule (64 caractères), le format vérifié par la base. */
export function calculerEmpreinte(contenu: ContenuSigne): string {
  // Un tableau JSON fixe l'ordre des champs et les sépare sans ambiguïté : une simple
  // concaténation donnerait la même empreinte à « ab » + « c » et à « a » + « bc ».
  const champs = JSON.stringify([
    VERSION_DE_LA_FORMULE,
    contenu.idIntervention,
    contenu.compteRendu,
    contenu.nomSignataire,
    contenu.signeeLe.toISOString(),
    contenu.idAuteur,
    sha256(contenu.image),
  ]);
  return sha256(Buffer.from(champs, 'utf8'));
}

function sha256(octets: Uint8Array): string {
  return createHash('sha256').update(octets).digest('hex');
}
