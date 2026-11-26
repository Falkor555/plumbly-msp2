import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { clientsApi, NOMBRE_CLIENTS_PROPOSES } from '../api/clients.api';
import type { AdresseClient, Client, ListePaginee } from '../api/types';
import { messageErreur } from '../commun/messageErreur';

const CHAMP =
  'mt-1 block h-11 w-full rounded border border-gray-300 bg-white px-3 text-sm text-anthracite focus-visible:border-sarcelle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sarcelle';
const BOUTON_SECONDAIRE =
  'h-11 shrink-0 rounded border border-gray-300 bg-white px-4 text-sm font-semibold text-sarcelle-profonde hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle';
const LONGUEUR_RECHERCHE_MINIMUM = 2;

type EtatRecherche =
  | { statut: 'attente' }
  | { statut: 'chargement' }
  | { statut: 'erreur'; message: string }
  | { statut: 'pret'; resultats: ListePaginee<Client> };

interface Props {
  client: Client | null;
  adresseId: number | null;
  onClient: (client: Client | null) => void;
  onAdresse: (adresseId: number) => void;
}

/**
 * US14 : retrouver le client (nom, téléphone ou ville), puis choisir l'adresse de l'intervention
 * parmi ses adresses en service. Le client n'est pas envoyé à l'API : il est déduit de l'adresse.
 */
export function ChoixClient({ client, adresseId, onClient, onAdresse }: Props) {
  if (client === null) {
    return <RechercheClient onChoisir={onClient} />;
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <span className="font-semibold">{client.nomAffiche}</span>
          <span className="ml-2 text-sm text-gris-texte">{client.telephone}</span>
        </p>
        <button type="button" onClick={() => onClient(null)} className={BOUTON_SECONDAIRE}>
          Changer de client
        </button>
      </div>
      {client.adresses.length === 0 ? (
        <p role="alert" className="text-sm text-erreur-texte">
          Ce client n’a aucune adresse en service : ajoutez-en une depuis sa fiche.
        </p>
      ) : (
        <fieldset>
          <legend className="text-sm font-semibold">Adresse de l’intervention</legend>
          <div className="mt-1 space-y-2">
            {client.adresses.map((adresse) => (
              <label
                key={adresse.id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded border border-bordure px-3 py-2 text-sm has-checked:border-sarcelle has-checked:bg-sarcelle-claire"
              >
                <input
                  type="radio"
                  name="adresse"
                  value={adresse.id}
                  checked={adresseId === adresse.id}
                  onChange={() => onAdresse(adresse.id)}
                  className="mt-0.5 h-4 w-4 accent-sarcelle"
                />
                <span>{adresseSurUneLigne(adresse)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

function adresseSurUneLigne(adresse: AdresseClient): string {
  const rue = adresse.complement ? `${adresse.rue}, ${adresse.complement}` : adresse.rue;
  return `${rue}, ${adresse.codePostal} ${adresse.ville}`;
}

function RechercheClient({ onChoisir }: { onChoisir: (client: Client) => void }) {
  const id = useId();
  const [texte, setTexte] = useState('');
  const [erreurSaisie, setErreurSaisie] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatRecherche>({ statut: 'attente' });
  // Une recherche relancée avant la réponse de la précédente l'annule : seule la dernière compte.
  const enCours = useRef<AbortController | null>(null);
  useEffect(() => () => enCours.current?.abort(), []);

  async function rechercher(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    const recherche = texte.trim();
    if (recherche.length < LONGUEUR_RECHERCHE_MINIMUM) {
      setErreurSaisie(
        `Saisissez au moins ${LONGUEUR_RECHERCHE_MINIMUM} caractères pour rechercher un client.`,
      );
      return;
    }
    setErreurSaisie(null);
    enCours.current?.abort();
    const controleur = new AbortController();
    enCours.current = controleur;
    setEtat({ statut: 'chargement' });
    try {
      const resultats = await clientsApi.rechercher(recherche, controleur.signal);
      setEtat({ statut: 'pret', resultats });
    } catch (erreur) {
      if (controleur.signal.aborted) return;
      setEtat({ statut: 'erreur', message: messageErreur(erreur, 'Recherche de clients') });
    }
  }

  return (
    <div className="space-y-3">
      <form role="search" aria-label="Rechercher un client" onSubmit={rechercher}>
        <label htmlFor={`${id}-client`} className="text-sm font-semibold">
          Client
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-client`}
            type="search"
            placeholder="Nom, téléphone ou ville"
            value={texte}
            onChange={(evenement) => setTexte(evenement.target.value)}
            aria-invalid={erreurSaisie !== null}
            aria-describedby={erreurSaisie ? `${id}-erreur` : undefined}
            className={CHAMP}
          />
          <button type="submit" className={`${BOUTON_SECONDAIRE} mt-1`}>
            Rechercher
          </button>
        </div>
        {erreurSaisie && (
          <p id={`${id}-erreur`} role="alert" className="mt-1 text-sm text-erreur-texte">
            {erreurSaisie}
          </p>
        )}
      </form>

      {etat.statut === 'chargement' && (
        <p className="text-sm text-gris-texte">Recherche des clients…</p>
      )}
      {etat.statut === 'erreur' && (
        <p role="alert" className="text-sm text-erreur-texte">
          {etat.message}
        </p>
      )}
      {etat.statut === 'pret' && <ResultatsClients liste={etat.resultats} onChoisir={onChoisir} />}
    </div>
  );
}

interface PropsResultats {
  liste: ListePaginee<Client>;
  onChoisir: (client: Client) => void;
}

function ResultatsClients({ liste, onChoisir }: PropsResultats) {
  if (liste.data.length === 0) {
    return <p className="text-sm text-gris-texte">Aucun client ne correspond à cette recherche.</p>;
  }
  return (
    <div className="space-y-2">
      <ul aria-label="Clients trouvés" className="space-y-2">
        {liste.data.map((client) => (
          <li key={client.id}>
            <button
              type="button"
              onClick={() => onChoisir(client)}
              className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 rounded border border-bordure bg-white px-3 py-2 text-left text-sm hover:border-sarcelle hover:bg-sarcelle-claire focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sarcelle"
            >
              <span className="font-semibold">{client.nomAffiche}</span>
              <span className="text-gris-texte">
                {client.telephone} · {client.adresses[0]?.ville ?? 'Sans adresse'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {liste.meta.total > liste.data.length && (
        <p className="text-sm text-gris-texte">
          {liste.meta.total} clients trouvés : seuls les {NOMBRE_CLIENTS_PROPOSES} premiers sont
          affichés. Précisez la recherche.
        </p>
      )}
    </div>
  );
}
