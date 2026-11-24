import { PageMaTournee } from './ma-tournee/PageMaTournee';
import { PagePlanning } from './planning/PagePlanning';

/*
 * Provisoire, en attendant le routeur et le layout de l'issue #9 : /ma-tournee affiche la vue
 * du technicien, toute autre adresse le planning du gestionnaire.
 */
export default function App() {
  return window.location.pathname.startsWith('/ma-tournee') ? <PageMaTournee /> : <PagePlanning />;
}
