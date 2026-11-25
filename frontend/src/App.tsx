import type { ReactElement } from 'react';
import { PageClients } from './clients/PageClients';
import { PageFicheClient } from './clients/PageFicheClient';
import { BarreNavigation, type Rubrique } from './commun/BarreNavigation';
import { lireIdentifiant } from './commun/identifiant';
import { PageIntrouvable } from './commun/PageIntrouvable';
import { PageMaTournee } from './ma-tournee/PageMaTournee';
import { PagePlanning } from './planning/PagePlanning';

interface PageChoisie {
  /** null pour la vue du technicien, qui n'a pas la navigation du gestionnaire. */
  rubrique: Rubrique | null;
  contenu: ReactElement;
}

/*
 * Aiguillage provisoire, remplacé par le routeur de l'issue #9 : la page est choisie d'après le
 * chemin de l'adresse, et les liens <a href> ordinaires rechargent l'application.
 *   /ma-tournee      vue du technicien
 *   /clients         liste des clients
 *   /clients/:id     fiche d'un client (id entier positif, sinon « Page introuvable »)
 *   toute autre      planning du gestionnaire
 */
function choisirPage(chemin: string): PageChoisie {
  if (chemin.startsWith('/ma-tournee')) return { rubrique: null, contenu: <PageMaTournee /> };
  const [rubrique, ...suite] = chemin.split('/').filter(Boolean);
  if (rubrique === 'clients') return { rubrique: 'clients', contenu: pageDesClients(suite) };
  return { rubrique: 'planning', contenu: <PagePlanning /> };
}

/** L'identifiant est validé avant tout appel : /clients/abc n'interroge pas l'API. */
function pageDesClients(suite: string[]): ReactElement {
  if (suite.length === 0) return <PageClients />;
  const id = suite.length === 1 ? lireIdentifiant(suite[0]) : null;
  if (id === null) {
    return (
      <PageIntrouvable retour={{ href: '/clients', libelle: 'Retour à la liste des clients' }} />
    );
  }
  return <PageFicheClient key={id} id={id} />;
}

export default function App() {
  const chemin = window.location.pathname;
  const { rubrique, contenu } = choisirPage(chemin);
  if (rubrique === null) return contenu;
  return (
    <>
      <BarreNavigation rubrique={rubrique} chemin={chemin} />
      {contenu}
    </>
  );
}
