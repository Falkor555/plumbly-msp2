import { Section } from './ElementsDeLaFiche';
import { HistoriqueClient } from './HistoriqueClient';

/** Historique des interventions du client (US09), consultable même une fois le client archivé. */
export function SectionHistorique({ idClient }: { idClient: number }) {
  return (
    <Section titre="Historique des interventions">
      <div className="px-4 py-4">
        <HistoriqueClient idClient={idClient} />
      </div>
    </Section>
  );
}
