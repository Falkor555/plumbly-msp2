import { http, HttpResponse, type HttpHandler } from 'msw';
import type { DateIso, FinDIntervention, Intervention, StatutIntervention } from '../api/types';
import type { JeuDeDemonstration } from './donneesDemonstration';

/*
 * Simulation en mémoire des routes de terrain (docs/api.md, 6.3) : démarrer, terminer avec ou
 * sans signature, compléter le compte rendu, lire la signature. Seules les règles qui changent ce
 * que voit l'écran sont reprises, avec les messages de l'API ; les vraies règles sont dans le back.
 */

const STATUTS_EN_TOUTES_LETTRES: Record<StatutIntervention, string> = {
  A_PLANIFIER: 'à planifier',
  PLANIFIEE: 'planifiée',
  EN_COURS: 'en cours',
  TERMINEE: 'terminée',
  ANNULEE: 'annulée',
};

// L'empreinte n'est pas calculée ici : seul le serveur en a besoin.
const EMPREINTE_FICTIVE = '3f8a'.repeat(16);

function erreur(statusCode: number, message: string | string[]) {
  return HttpResponse.json({ statusCode, message }, { status: statusCode });
}

interface Options {
  urlApi: (chemin: string) => string;
  aujourdhui: () => DateIso;
  maintenant?: () => Date;
}

export function creerHandlersInterventions(
  jeu: JeuDeDemonstration,
  { urlApi, aujourdhui, maintenant = () => new Date() }: Options,
): HttpHandler[] {
  function trouverDansUneTournee(id: number) {
    for (const technicien of jeu.techniciens) {
      for (const tournee of technicien.tournees) {
        const intervention = tournee.interventions.find((candidate) => candidate.id === id);
        if (intervention) return { technicien, tournee, intervention };
      }
    }
    return null;
  }

  function statutRefuse(intervention: Intervention, verbe: string) {
    return erreur(
      400,
      `Impossible ${verbe} une intervention ${STATUTS_EN_TOUTES_LETTRES[intervention.statut]}.`,
    );
  }

  return [
    http.post(urlApi('/interventions/:id/start'), ({ params }) => {
      const trouvee = trouverDansUneTournee(Number(params.id));
      if (!trouvee) return erreur(404, 'Intervention introuvable.');
      const { tournee, intervention } = trouvee;
      if (intervention.statut !== 'PLANIFIEE') return statutRefuse(intervention, 'de démarrer');
      if (tournee.dateTournee !== aujourdhui()) {
        return erreur(
          400,
          `Cette intervention est prévue le ${tournee.dateTournee} : elle ne peut être démarrée que ce jour-là.`,
        );
      }
      Object.assign(intervention, { statut: 'EN_COURS', demarreeLe: maintenant().toISOString() });
      return HttpResponse.json(intervention);
    }),

    http.post(urlApi('/interventions/:id/complete'), async ({ params, request }) => {
      const trouvee = trouverDansUneTournee(Number(params.id));
      if (!trouvee) return erreur(404, 'Intervention introuvable.');
      const { technicien, intervention } = trouvee;
      // Le corps est facultatif : sans compte rendu ni signature, l'écran n'envoie rien.
      const texte = await request.text();
      const fin = (texte ? JSON.parse(texte) : {}) as FinDIntervention;
      if (fin.signature && !fin.compteRendu?.trim()) {
        return erreur(400, ['compteRendu est obligatoire']);
      }
      if (intervention.statut !== 'EN_COURS') return statutRefuse(intervention, 'de terminer');
      const termineeLe = maintenant().toISOString();
      Object.assign(intervention, {
        statut: 'TERMINEE',
        termineeLe,
        compteRendu: fin.compteRendu?.trim() ?? intervention.compteRendu,
        signature: fin.signature
          ? { nomSignataire: fin.signature.nomSignataire.trim(), signeeLe: termineeLe }
          : null,
      });
      if (fin.signature && intervention.signature) {
        jeu.signatures[intervention.id] = {
          ...intervention.signature,
          auteur: { id: technicien.id, nom: technicien.nom, prenom: technicien.prenom },
          empreinte: EMPREINTE_FICTIVE,
          integre: true,
          image: fin.signature.image,
        };
      }
      return HttpResponse.json(intervention);
    }),

    http.patch(urlApi('/interventions/:id/report'), async ({ params, request }) => {
      const trouvee = trouverDansUneTournee(Number(params.id));
      if (!trouvee) return erreur(404, 'Intervention introuvable.');
      const { intervention } = trouvee;
      const { compteRendu } = (await request.json()) as { compteRendu?: string };
      if (intervention.statut !== 'TERMINEE') {
        return erreur(
          400,
          `Le compte rendu se complète sur une intervention terminée (statut actuel : ${STATUTS_EN_TOUTES_LETTRES[intervention.statut]}).`,
        );
      }
      if (intervention.signature) {
        return erreur(400, 'Le compte rendu d’une intervention signée ne se modifie plus.');
      }
      if (!compteRendu?.trim()) return erreur(400, ['compteRendu ne peut pas être vide']);
      intervention.compteRendu = compteRendu.trim();
      return HttpResponse.json(intervention);
    }),

    http.get(urlApi('/interventions/:id/signature'), ({ params }) => {
      const id = Number(params.id);
      if (!trouverDansUneTournee(id)) return erreur(404, 'Intervention introuvable.');
      const signature = jeu.signatures[id];
      if (!signature) return erreur(404, 'Cette intervention n’a pas été signée.');
      return HttpResponse.json(signature);
    }),
  ];
}
