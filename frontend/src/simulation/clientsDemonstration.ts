import type { Adresse, Client } from '../api/types';
import { fabriquerAdresse, fabriquerClient } from './fabriques';

/*
 * Clients de démonstration du mode simulé : des particuliers et des professionnels de La Réunion,
 * aux noms accentués pour éprouver la recherche sans accents (US08). Les identifiants sont nommés
 * pour que les interventions de démonstration (donneesDemonstration.ts) se rattachent à eux.
 */

export const CLIENT_HELENE_PAYET = 1;
export const CLIENT_BOULANGERIE_GRONDIN = 2;
export const CLIENT_MARIE_CLAUDE_HOARAU = 3;
export const CLIENT_JEAN_YVES_FONTAINE = 4;
export const CLIENT_ROSEMAY_NATIVEL = 5;
export const CLIENT_RESIDENCE_LATANIERS = 6;
export const CLIENT_JOSIANE_BARET = 7;
export const CLIENT_EXPEDIT_PAYET = 8;
export const CLIENT_YOLANDE_GRONDIN = 9;
export const CLIENT_GARAGE_HOARAU = 10;
/** A déménagé : son ancienne adresse est archivée. */
export const CLIENT_JEAN_BERNARD_TECHER = 11;
export const CLIENT_CLEMENT_RIVIERE = 12;
/** Client archivé : visible seulement avec « inclure les archivés ». */
export const CLIENT_MARIE_THERESE_DIJOUX = 13;

const ARCHIVE_LE = '2026-11-10T05:30:00.000Z';

function particulier(
  id: number,
  prenom: string,
  nom: string,
  telephone: string,
  surcharge: Partial<Client> = {},
): Client {
  return fabriquerClient({
    id,
    nomClient: nom,
    prenomClient: prenom,
    nomAffiche: `${prenom} ${nom}`,
    telephone,
    ...surcharge,
  });
}

function professionnel(
  id: number,
  raisonSociale: string,
  telephone: string,
  surcharge: Partial<Client> = {},
): Client {
  return fabriquerClient({
    id,
    typeClient: 'PROFESSIONNEL',
    raisonSociale,
    nomAffiche: raisonSociale,
    telephone,
    ...surcharge,
  });
}

/** Adresse n° `rang` du client (10 × id + rang), dans une commune de La Réunion. */
function adresse(
  idClient: number,
  rang: number,
  rue: string,
  codePostal: string,
  ville: string,
  complements: { complement?: string; infosAcces?: string; archive?: boolean } = {},
): Adresse {
  return fabriquerAdresse({
    id: idClient * 10 + rang,
    rue,
    codePostal,
    ville,
    complement: complements.complement ?? null,
    infosAcces: complements.infosAcces ?? null,
    archive: complements.archive ?? false,
    archiveLe: complements.archive ? ARCHIVE_LE : null,
  });
}

/** Treize clients, dont un archivé ; les identifiants suivent l'ordre de création. */
export function clientsDeDemonstration(): Client[] {
  return [
    particulier(CLIENT_HELENE_PAYET, 'Hélène', 'Payet', '0692123456', {
      emailClient: 'helene.payet@exemple.re',
      adresses: [
        adresse(CLIENT_HELENE_PAYET, 0, '12 rue des Lilas', '97400', 'Saint-Denis', {
          complement: 'Bât. B',
          infosAcces: 'Code 4521, 3e étage',
        }),
        adresse(CLIENT_HELENE_PAYET, 1, '3 chemin des Tamarins', '97430', 'Le Tampon'),
      ],
    }),
    professionnel(CLIENT_BOULANGERIE_GRONDIN, 'Boulangerie Chez Mémé Grondin', '0262414243', {
      emailClient: 'contact@chezmemegrondin.re',
      adresses: [
        adresse(CLIENT_BOULANGERIE_GRONDIN, 0, '45 rue de la Gare', '97438', 'Sainte-Marie', {
          infosAcces: 'Livraisons par la cour arrière, avant 6 h',
        }),
      ],
    }),
    particulier(CLIENT_MARIE_CLAUDE_HOARAU, 'Marie-Claude', 'Hoarau', '0692445566', {
      adresses: [
        adresse(
          CLIENT_MARIE_CLAUDE_HOARAU,
          0,
          '8 allée des Bougainvilliers',
          '97400',
          'Saint-Denis',
        ),
      ],
    }),
    particulier(CLIENT_JEAN_YVES_FONTAINE, 'Jean-Yves', 'Fontaine', '0693778899', {
      emailClient: 'jy.fontaine@exemple.re',
      adresses: [
        adresse(CLIENT_JEAN_YVES_FONTAINE, 0, '21 rue Léon de Lépervanche', '97420', 'Le Port'),
      ],
    }),
    particulier(CLIENT_ROSEMAY_NATIVEL, 'Rosemay', 'Nativel', '0692778800', {
      adresses: [
        adresse(CLIENT_ROSEMAY_NATIVEL, 0, '5 impasse des Letchis', '97460', 'Saint-Paul', {
          infosAcces: 'Chien dans la cour : appeler avant d’entrer',
        }),
      ],
    }),
    professionnel(CLIENT_RESIDENCE_LATANIERS, 'Résidence Les Lataniers', '0262303132', {
      emailClient: 'syndic@lataniers.re',
      adresses: [
        adresse(CLIENT_RESIDENCE_LATANIERS, 0, '110 boulevard Sud', '97490', 'Saint-Denis', {
          complement: 'Loge du gardien',
          infosAcces: 'Interphone « Syndic », badge à la loge',
        }),
      ],
    }),
    particulier(CLIENT_JOSIANE_BARET, 'Josiane', 'Baret', '0692101112', {
      adresses: [
        adresse(CLIENT_JOSIANE_BARET, 0, '14 rue Marius et Ary Leblond', '97410', 'Saint-Pierre'),
      ],
    }),
    particulier(CLIENT_EXPEDIT_PAYET, 'Expédit', 'Payet', '0693202122', {
      adresses: [adresse(CLIENT_EXPEDIT_PAYET, 0, '2 chemin Dubuisson', '97436', 'Saint-Leu')],
    }),
    particulier(CLIENT_YOLANDE_GRONDIN, 'Yolande', 'Grondin', '0692303132', {
      adresses: [
        adresse(CLIENT_YOLANDE_GRONDIN, 0, '27 rue des Bons Enfants', '97410', 'Saint-Pierre', {
          infosAcces: 'Boîte à clés derrière le pot de fleurs',
        }),
      ],
    }),
    professionnel(CLIENT_GARAGE_HOARAU, 'Garage Hoarau', '0262272829', {
      adresses: [
        adresse(CLIENT_GARAGE_HOARAU, 0, '36 rue Hubert Delisle', '97430', 'Le Tampon', {
          complement: 'Atelier au fond de la cour',
          infosAcces: 'Sonner au portail bleu',
        }),
      ],
    }),
    particulier(CLIENT_JEAN_BERNARD_TECHER, 'Jean-Bernard', 'Técher', '0692404142', {
      adresses: [
        adresse(
          CLIENT_JEAN_BERNARD_TECHER,
          0,
          '9 rue de la Rivière du Mât',
          '97470',
          'Saint-Benoît',
          {
            archive: true,
          },
        ),
        adresse(CLIENT_JEAN_BERNARD_TECHER, 1, '18 rue du Stade', '97440', 'Saint-André'),
      ],
    }),
    particulier(CLIENT_CLEMENT_RIVIERE, 'Clément', 'Rivière', '0693505152', {
      emailClient: 'clement.riviere@exemple.re',
      adresses: [
        adresse(CLIENT_CLEMENT_RIVIERE, 0, '7 rue Amiral Bouvet', '97470', 'Saint-Benoît'),
      ],
    }),
    particulier(CLIENT_MARIE_THERESE_DIJOUX, 'Marie-Thérèse', 'Dijoux', '0692606162', {
      archive: true,
      archiveLe: ARCHIVE_LE,
      adresses: [
        adresse(
          CLIENT_MARIE_THERESE_DIJOUX,
          0,
          '4 rue Évariste de Parny',
          '97419',
          'La Possession',
        ),
      ],
    }),
  ];
}
