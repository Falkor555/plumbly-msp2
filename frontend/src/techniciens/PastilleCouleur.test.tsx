import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONTRASTE_MINIMAL_TEXTE, rapportDeContraste } from '../commun/contraste';
import { PastilleCouleur } from './PastilleCouleur';

/** Palette où l'API choisit la couleur d'un nouveau technicien (regles-techniciens.ts). */
const PALETTE_DE_L_API = [
  '#0F766E',
  '#1E88E5',
  '#AF4C00',
  '#7B1FA2',
  '#2E7D32',
  '#C62828',
  '#00838F',
  '#5D4037',
  '#AD1457',
  '#455A64',
];

function initialesSur(couleur: string): HTMLElement {
  render(<PastilleCouleur couleur={couleur} texte="KB" />);
  return screen.getByText('KB');
}

/** Couleur que la classe de texte de la pastille applique (valeurs de Tailwind). */
function couleurDuTexte(pastille: HTMLElement): string {
  if (pastille.classList.contains('text-black')) return '#000000';
  if (pastille.classList.contains('text-white')) return '#ffffff';
  throw new Error(`Pastille sans couleur de texte connue : « ${pastille.className} »`);
}

describe('pastille de la couleur du planning (US11)', () => {
  it('US11 : une couleur claire porte des initiales noires', () => {
    const pastille = initialesSur('#FFEB3B');

    expect(pastille).toHaveClass('text-black');
    expect(pastille).toHaveStyle({ backgroundColor: '#FFEB3B' });
  });

  it('US11 : une couleur foncée porte des initiales blanches', () => {
    const pastille = initialesSur('#5D4037');

    expect(pastille).toHaveClass('text-white');
    expect(pastille).toHaveStyle({ backgroundColor: '#5D4037' });
  });

  it('US11 : une couleur qui n’est pas au format #RRGGBB n’est pas appliquée : la sarcelle la remplace', () => {
    const pastille = initialesSur('red; background-image: url(x)');

    expect(pastille).toHaveStyle({ backgroundColor: '#0F766E' });
    expect(pastille).toHaveClass('text-white');
  });

  it('US11 : décorative, la pastille est masquée aux lecteurs d’écran, avec ou sans texte', () => {
    const { container } = render(<PastilleCouleur couleur="#1E88E5" />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveStyle({ backgroundColor: '#1E88E5' });
    expect(initialesSur('#1E88E5')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(PALETTE_DE_L_API)(
    'RGAA 3.2 : les initiales posées sur %s atteignent 4,5:1',
    (couleur) => {
      const texte = couleurDuTexte(initialesSur(couleur));

      expect(rapportDeContraste(texte, couleur)).toBeGreaterThanOrEqual(CONTRASTE_MINIMAL_TEXTE);
    },
  );
});
