import {
  COLONNES_EXPORT_INTERVENTIONS,
  versLignesCsvInterventions,
} from './export-interventions.js';
import type { InterventionDetaillee } from './intervention-detaillee.js';

const CREE_LE = new Date('2026-11-23T21:30:00Z'); // 24 novembre, 1 h 30 à La Réunion
const DEBUT_PREVU = new Date('2026-11-27T04:00:00Z'); // 8 h à La Réunion
const TERMINEE_LE = new Date('2026-11-27T05:42:00Z'); // 9 h 42 à La Réunion

/** Intervention planifiée chez un particulier, dans la tournée de Karim Payet. */
function intervention(champs: Partial<InterventionDetaillee> = {}): InterventionDetaillee {
  return {
    id: 12,
    description: 'Plus d’eau chaude',
    urgence: 'URGENTE',
    statut: 'PLANIFIEE',
    dureeEstimeeMin: 90,
    debutPrevu: DEBUT_PREVU,
    finPrevue: null,
    ordreTournee: 1,
    compteRendu: 'Résistance changée',
    motifAnnulation: null,
    demarreeLe: null,
    termineeLe: null,
    annuleeLe: null,
    creeLe: CREE_LE,
    majLe: CREE_LE,
    idAdresse: 15,
    idTypeIntervention: 1,
    idCreateur: 3,
    idTournee: 5,
    typeIntervention: { id: 1, libelle: 'Chauffe-eau', dureeDefautMin: 90 },
    adresse: {
      id: 15,
      rue: '12 rue des Manguiers',
      complement: 'Bât. B',
      codePostal: '97400',
      ville: 'Saint-Denis',
      infosAcces: 'Code 4521',
      archive: false,
      archiveLe: null,
      idClient: 8,
      client: {
        id: 8,
        typeClient: 'PARTICULIER',
        nomClient: 'Dupont',
        prenomClient: 'Marie',
        raisonSociale: null,
        telephone: '0692123456',
        emailClient: 'marie.dupont@exemple.re',
        archive: false,
        archiveLe: null,
        creeLe: CREE_LE,
        majLe: CREE_LE,
      },
    },
    createur: { id: 3, nom: 'Martin', prenom: 'Sophie' },
    tournee: {
      id: 5,
      dateTournee: new Date('2026-11-27T00:00:00Z'),
      creeLe: CREE_LE,
      idTechnicien: 2,
      idCreateur: 3,
      technicien: {
        id: 2,
        telephone: '0692000001',
        couleurPlanning: '#0F766E',
        archive: false,
        archiveLe: null,
        idUtilisateur: 7,
        utilisateur: { nom: 'Payet', prenom: 'Karim' },
      },
    },
    signature: null,
    ...champs,
  };
}

describe('versLignesCsvInterventions', () => {
  it('donne les 14 colonnes du contrat, puis signee', () => {
    expect(COLONNES_EXPORT_INTERVENTIONS).toEqual([
      'id',
      'cree_le',
      'client',
      'code_postal',
      'ville',
      'type_intervention',
      'description',
      'urgence',
      'statut',
      'duree_estimee_min',
      'debut_prevu',
      'technicien',
      'ordre_tournee',
      'terminee_le',
      'signee',
    ]);
  });

  it('écrit une intervention planifiée, dates et heures à La Réunion', () => {
    expect(versLignesCsvInterventions([intervention()])).toEqual([
      [
        12,
        '2026-11-24',
        'Marie Dupont',
        '97400',
        'Saint-Denis',
        'Chauffe-eau',
        'Plus d’eau chaude',
        'URGENTE',
        'PLANIFIEE',
        90,
        '2026-11-27 08:00',
        'Karim Payet',
        1,
        null,
        'non',
      ],
    ]);
  });

  it('ne contient ni téléphone, ni e-mail, ni rue, ni accès, ni compte rendu, ni motif, ni signataire', () => {
    const signee = intervention({
      statut: 'TERMINEE',
      termineeLe: TERMINEE_LE,
      motifAnnulation: 'Motif confidentiel',
      signature: { nomSignataire: 'Jean Signataire', signeeLe: TERMINEE_LE },
    });

    const texte = JSON.stringify(versLignesCsvInterventions([signee]));

    for (const absent of [
      '0692123456',
      'marie.dupont@exemple.re',
      '12 rue des Manguiers',
      'Bât. B',
      'Code 4521',
      'Résistance changée',
      'Motif confidentiel',
      'Jean Signataire',
    ]) {
      expect(texte).not.toContain(absent);
    }
  });

  it('écrit la fin à La Réunion et signee à oui pour une intervention signée', () => {
    const signee = intervention({
      statut: 'TERMINEE',
      termineeLe: TERMINEE_LE,
      signature: { nomSignataire: 'Jean Signataire', signeeLe: TERMINEE_LE },
    });

    const [ligne] = versLignesCsvInterventions([signee]);

    expect(ligne.slice(13)).toEqual(['2026-11-27 09:42', 'oui']);
  });

  it('laisse vides le début, le technicien et le rang d’une intervention à planifier', () => {
    const aPlanifier = intervention({
      statut: 'A_PLANIFIER',
      debutPrevu: null,
      ordreTournee: null,
      idTournee: null,
      tournee: null,
    });

    const [ligne] = versLignesCsvInterventions([aPlanifier]);

    expect([ligne[10], ligne[11], ligne[12]]).toEqual([null, null, null]);
  });

  it('écrit la raison sociale d’un professionnel comme nom du client', () => {
    const professionnel = intervention();
    professionnel.adresse.client = {
      ...professionnel.adresse.client,
      typeClient: 'PROFESSIONNEL',
      nomClient: null,
      prenomClient: null,
      raisonSociale: 'Boulangerie Hoarau',
    };

    expect(versLignesCsvInterventions([professionnel])[0][2]).toBe('Boulangerie Hoarau');
  });

  it('écrit la durée et le rang en nombres (jamais neutralisés)', () => {
    const [ligne] = versLignesCsvInterventions([intervention()]);

    expect([typeof ligne[0], typeof ligne[9], typeof ligne[12]]).toEqual([
      'number',
      'number',
      'number',
    ]);
  });

  it('garde l’ordre reçu', () => {
    const lignes = versLignesCsvInterventions([intervention({ id: 3 }), intervention({ id: 1 })]);

    expect(lignes.map((ligne) => ligne[0])).toEqual([3, 1]);
  });
});
