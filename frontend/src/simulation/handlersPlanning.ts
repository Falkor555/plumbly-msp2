import { http, HttpResponse, type HttpHandler } from 'msw';
import type {
  Affectation,
  DateIso,
  Intervention,
  ListePaginee,
  NouvelleTournee,
  Planning,
  Tournee,
} from '../api/types';
import { heureMetier } from '../commun/dates';
import { creneau } from '../planning/presentation';
import { type JeuDeDemonstration, planifier } from './donneesDemonstration';

/*
 * Simulation en mémoire des routes de planification, fidèle au contrat (docs/api.md, 6.7) mais
 * simplifiée : seul le chevauchement (RG09) est contrôlé. Les vraies règles sont dans l'API (#19).
 */

/** Technicien « connecté » du mode simulé, faute d'authentification (#13). */
const TECHNICIEN_CONNECTE_ID = 1;

function chevauche(a: Intervention, debut: Date, fin: Date): boolean {
  if (!a.debutPrevu || !a.finPrevue) return false;
  return debut < new Date(a.finPrevue) && fin > new Date(a.debutPrevu);
}

function erreur(statusCode: number, message: string) {
  return HttpResponse.json({ statusCode, message }, { status: statusCode });
}

export function creerHandlersPlanning(
  jeu: JeuDeDemonstration,
  options: { urlApi: (chemin: string) => string; aujourdhui: () => DateIso },
): HttpHandler[] {
  const { urlApi } = options;
  let prochainIdTournee = 1000;

  function trouverTournee(id: number) {
    for (const technicien of jeu.techniciens) {
      const tournee = technicien.tournees.find((candidate) => candidate.id === id);
      if (tournee) return { technicien, tournee };
    }
    return null;
  }

  function versTournee(tourneeId: number): Tournee | null {
    const trouvee = trouverTournee(tourneeId);
    if (!trouvee) return null;
    const { id, nom, prenom, telephone, couleurPlanning } = trouvee.technicien;
    return { ...trouvee.tournee, technicien: { id, nom, prenom, telephone, couleurPlanning } };
  }

  return [
    http.get(urlApi('/tours'), ({ request }) => {
      const parametres = new URL(request.url).searchParams;
      const du = parametres.get('du') ?? '';
      const au = parametres.get('au') ?? '';
      const planning: Planning = {
        du,
        au,
        // Comme l'API : les techniciens en service seulement, une fiche archivée sort du planning.
        techniciens: jeu.techniciens
          .filter(({ archive }) => !archive)
          .map(({ id, nom, prenom, telephone, couleurPlanning, indisponibilites, tournees }) => ({
            id,
            nom,
            prenom,
            telephone,
            couleurPlanning,
            indisponibilites,
            tournees: tournees.filter(({ dateTournee }) => dateTournee >= du && dateTournee <= au),
          })),
      };
      return HttpResponse.json(planning);
    }),

    http.get(urlApi('/tours/me/today'), () => {
      const technicien = jeu.techniciens.find(({ id }) => id === TECHNICIEN_CONNECTE_ID);
      const tournee = technicien?.tournees.find(
        ({ dateTournee }) => dateTournee === options.aujourdhui(),
      );
      if (!tournee) return new HttpResponse(null, { status: 204 });
      return HttpResponse.json(versTournee(tournee.id));
    }),

    http.post(urlApi('/tours'), async ({ request }) => {
      const corps = (await request.json()) as NouvelleTournee;
      const technicien = jeu.techniciens.find(({ id }) => id === corps.technicienId);
      if (!technicien) return erreur(404, 'Technicien introuvable.');
      if (technicien.tournees.some(({ dateTournee }) => dateTournee === corps.dateTournee)) {
        return erreur(409, 'Ce technicien a déjà une tournée ce jour-là.');
      }
      const tournee = {
        id: prochainIdTournee++,
        dateTournee: corps.dateTournee,
        interventions: [],
      };
      technicien.tournees.push(tournee);
      return HttpResponse.json(versTournee(tournee.id), { status: 201 });
    }),

    http.post(urlApi('/tours/:id/interventions'), async ({ params, request }) => {
      const trouvee = trouverTournee(Number(params.id));
      if (!trouvee) return erreur(404, 'Tournée introuvable.');
      const corps = (await request.json()) as Affectation;
      const rang = jeu.interventionsAPlanifier.findIndex(({ id }) => id === corps.interventionId);
      if (rang === -1) return erreur(400, "Cette intervention n'est pas à planifier.");

      const { tournee } = trouvee;
      const candidate = planifier(
        jeu.interventionsAPlanifier[rang],
        tournee.dateTournee,
        heureMetier(corps.debutPrevu),
        tournee.interventions.length + 1,
      );
      const debut = new Date(corps.debutPrevu);
      const fin = new Date(debut.getTime() + candidate.dureeEstimeeMin * 60_000);
      const conflit = tournee.interventions.find((existante) => chevauche(existante, debut, fin));
      if (conflit) {
        return erreur(
          409,
          `Ce créneau chevauche l'intervention n° ${conflit.id} (${creneau(conflit)}).`,
        );
      }
      jeu.interventionsAPlanifier.splice(rang, 1);
      tournee.interventions.push(candidate);
      tournee.interventions.sort((a, b) => (a.debutPrevu ?? '').localeCompare(b.debutPrevu ?? ''));
      tournee.interventions.forEach(
        (intervention, index) => (intervention.ordreTournee = index + 1),
      );
      return HttpResponse.json(versTournee(tournee.id));
    }),

    http.get(urlApi('/interventions'), () => {
      const liste: ListePaginee<Intervention> = {
        data: jeu.interventionsAPlanifier,
        meta: { page: 1, limit: 100, total: jeu.interventionsAPlanifier.length, totalPages: 1 },
      };
      return HttpResponse.json(liste);
    }),
  ];
}
