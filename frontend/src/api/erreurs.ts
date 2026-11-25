/** Corps d'erreur renvoyé par NestJS (cahier des charges, 8.3). */
export interface CorpsErreurApi {
  statusCode: number;
  // La validation de l'API renvoie un tableau de messages, un par champ refusé ou invalide.
  message: string | string[];
  error?: string;
}

const MESSAGES_GENERIQUES: Record<number, string> = {
  0: 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.',
  401: 'Votre session a expiré. Veuillez vous reconnecter.',
  403: "Vous n'avez pas les droits pour effectuer cette action.",
  404: "L'élément demandé est introuvable.",
  429: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
};

const MESSAGE_PAR_DEFAUT = 'Une erreur est survenue. Réessayez plus tard.';

/** Erreur HTTP renvoyée par l'API Plumbly. */
export class ErreurApi extends Error {
  readonly statut: number;
  readonly messagesServeur: string[];

  constructor(statut: number, messagesServeur: string[]) {
    super(messagesServeur[0] ?? `Erreur HTTP ${statut}`);
    this.name = 'ErreurApi';
    this.statut = statut;
    this.messagesServeur = messagesServeur;
  }

  /**
   * Message affichable à l'écran.
   * Les 400 (validation des DTO) et les 409 (conflit de planning, US21) portent des messages
   * métier rédigés par notre API pour l'utilisateur : on les montre. Pour les autres statuts,
   * le message serveur peut révéler des détails techniques : on affiche un texte générique.
   */
  messagePourUtilisateur(): string {
    const estMessageMetier = this.statut === 400 || this.statut === 409;
    if (estMessageMetier && this.messagesServeur.length > 0) {
      return this.messagesServeur.join('\n');
    }
    return MESSAGES_GENERIQUES[this.statut] ?? MESSAGE_PAR_DEFAUT;
  }
}

/** Le serveur n'a pas répondu (réseau coupé, API arrêtée, CORS refusé). */
export class ErreurReseau extends ErreurApi {
  constructor(cause: unknown) {
    super(0, []);
    this.name = 'ErreurReseau';
    this.cause = cause;
  }
}

export async function creerErreurApi(reponse: Response): Promise<ErreurApi> {
  return new ErreurApi(reponse.status, await lireMessagesServeur(reponse));
}

async function lireMessagesServeur(reponse: Response): Promise<string[]> {
  const texte = await reponse.text();
  try {
    const corps = JSON.parse(texte) as Partial<CorpsErreurApi>;
    if (Array.isArray(corps.message)) return corps.message;
    return typeof corps.message === 'string' ? [corps.message] : [];
  } catch {
    // Corps non JSON (page HTML d'un proxy en 502, par exemple) : seul le statut est exploitable.
    return [];
  }
}
