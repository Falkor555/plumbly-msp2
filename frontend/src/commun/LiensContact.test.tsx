import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LienAppeler, LienItineraire } from './LiensContact';

describe('boutons « Appeler » et « Itinéraire » (#49)', () => {
  it('US24 : « Appeler » porte le nom du client et un lien tel: fait des seuls chiffres et du +', () => {
    render(<LienAppeler nom="Marie Dupont" telephone="+262 692 12.34.56" />);

    expect(screen.getByRole('link', { name: 'Appeler Marie Dupont' })).toHaveAttribute(
      'href',
      'tel:+262692123456',
    );
  });

  it('US24 : « Itinéraire » ouvre la carte dans un nouvel onglet, adresse encodée', () => {
    render(
      <LienItineraire
        adresse={{ rue: '12 rue des Lilas & Co', codePostal: '97400', ville: 'Saint-Denis' }}
      />,
    );

    const lien = screen.getByRole('link', { name: 'Itinéraire (nouvel onglet)' });
    expect(lien).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=12%20rue%20des%20Lilas%20%26%20Co%2C%2097400%20Saint-Denis',
    );
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
