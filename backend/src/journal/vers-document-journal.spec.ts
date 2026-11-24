import type { AuteurJournal, EmailMasque } from './journal.types.js';
import { versDocumentJournal } from './vers-document-journal.js';

const DATE = new Date('2026-12-08T05:03:12.000Z');
const GESTIONNAIRE: AuteurJournal = { id: 2, role: 'GESTIONNAIRE' };
const TECHNICIEN: AuteurJournal = { id: 7, role: 'TECHNICIEN' };

describe('versDocumentJournal', () => {
  it('STATUT_MODIFIE : statut avant et après sur l’intervention', () => {
    const document = versDocumentJournal(
      {
        type: 'STATUT_MODIFIE',
        auteur: TECHNICIEN,
        interventionId: 42,
        ancienStatut: 'PLANIFIEE',
        nouveauStatut: 'EN_COURS',
      },
      DATE,
    );

    expect(document).toEqual({
      date: DATE,
      action: 'STATUT_MODIFIE',
      auteur: { id: 7, role: 'TECHNICIEN' },
      entite: { type: 'intervention', id: 42 },
      avant: { statut: 'PLANIFIEE' },
      apres: { statut: 'EN_COURS' },
    });
  });

  it('INTERVENTION_ANNULEE : passage à ANNULEE et motif dans le contexte', () => {
    const document = versDocumentJournal(
      {
        type: 'INTERVENTION_ANNULEE',
        auteur: GESTIONNAIRE,
        interventionId: 42,
        ancienStatut: 'PLANIFIEE',
        motif: 'Client absent',
      },
      DATE,
    );

    expect(document).toEqual({
      date: DATE,
      action: 'INTERVENTION_ANNULEE',
      auteur: { id: 2, role: 'GESTIONNAIRE' },
      entite: { type: 'intervention', id: 42 },
      avant: { statut: 'PLANIFIEE' },
      apres: { statut: 'ANNULEE' },
      contexte: { motif: 'Client absent' },
    });
  });

  it('CONNEXION_REUSSIE : l’entité est l’utilisateur qui se connecte', () => {
    const document = versDocumentJournal({ type: 'CONNEXION_REUSSIE', auteur: TECHNICIEN }, DATE);

    expect(document).toEqual({
      date: DATE,
      action: 'CONNEXION_REUSSIE',
      auteur: { id: 7, role: 'TECHNICIEN' },
      entite: { type: 'utilisateur', id: 7 },
    });
  });

  it('CONNEXION_ECHOUEE : sans auteur, avec l’e-mail masqué et le compte visé', () => {
    const document = versDocumentJournal(
      {
        type: 'CONNEXION_ECHOUEE',
        emailMasque: 'k***@exemple.fr' as EmailMasque,
        utilisateurId: 7,
      },
      DATE,
    );

    expect(document).toEqual({
      date: DATE,
      action: 'CONNEXION_ECHOUEE',
      entite: { type: 'utilisateur', id: 7 },
      contexte: { emailMasque: 'k***@exemple.fr' },
    });
  });

  it('CONNEXION_ECHOUEE sur un e-mail inconnu : entite.id vaut null', () => {
    const document = versDocumentJournal(
      { type: 'CONNEXION_ECHOUEE', emailMasque: 'x***@inconnu.fr' as EmailMasque },
      DATE,
    );

    expect(document.entite).toEqual({ type: 'utilisateur', id: null });
    expect(document).not.toHaveProperty('auteur');
  });

  it('COMPTE_CREE : rôle et état actif du nouveau compte', () => {
    const document = versDocumentJournal(
      {
        type: 'COMPTE_CREE',
        auteur: { id: 1, role: 'ADMIN' },
        utilisateurId: 9,
        role: 'TECHNICIEN',
      },
      DATE,
    );

    expect(document).toEqual({
      date: DATE,
      action: 'COMPTE_CREE',
      auteur: { id: 1, role: 'ADMIN' },
      entite: { type: 'utilisateur', id: 9 },
      apres: { role: 'TECHNICIEN', actif: true },
    });
  });

  it('COMPTE_DESACTIVE : le compte passe d’actif à inactif', () => {
    const document = versDocumentJournal(
      { type: 'COMPTE_DESACTIVE', auteur: { id: 1, role: 'ADMIN' }, utilisateurId: 9 },
      DATE,
    );

    expect(document).toEqual({
      date: DATE,
      action: 'COMPTE_DESACTIVE',
      auteur: { id: 1, role: 'ADMIN' },
      entite: { type: 'utilisateur', id: 9 },
      avant: { actif: true },
      apres: { actif: false },
    });
  });

  it('ne recopie de l’auteur que son identifiant et son rôle', () => {
    const utilisateurComplet = { id: 7, role: 'TECHNICIEN', email: 'k@exemple.fr', nom: 'Benali' };

    const document = versDocumentJournal(
      { type: 'CONNEXION_REUSSIE', auteur: utilisateurComplet as AuteurJournal },
      DATE,
    );

    expect(document.auteur).toEqual({ id: 7, role: 'TECHNICIEN' });
  });
});
