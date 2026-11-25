import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IMAGE_PNG_DE_TEST as IMAGE, simulerCanvas } from '../test/canvas';
import { type PoigneeZoneSignature, ZoneSignature } from './ZoneSignature';

function afficher(desactivee = false) {
  const onChangement = vi.fn();
  const poignee = createRef<PoigneeZoneSignature>();
  render(<ZoneSignature onChangement={onChangement} desactivee={desactivee} ref={poignee} />);
  const zone = screen.getByRole('img', { name: 'Zone de signature du client' });
  return { onChangement, poignee, zone };
}

describe('zone de signature (US33)', () => {
  it('commence vide, avec la consigne et « Effacer » indisponible', () => {
    simulerCanvas();

    const { zone, onChangement } = afficher();

    expect(zone).toHaveAccessibleDescription(
      'Le client signe dans le cadre, avec le doigt ou un stylet.',
    );
    expect(screen.getByText('Zone vide.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeDisabled();
    expect(onChangement).not.toHaveBeenCalled();
  });

  it('trace le trait aux coordonnées du canvas et signale la zone dessinée une seule fois', () => {
    const { pinceau } = simulerCanvas();
    const { zone, onChangement } = afficher();

    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 150, clientY: 50 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 160, clientY: 55 });
    fireEvent.pointerUp(zone, { pointerId: 1 });

    expect(pinceau.moveTo).toHaveBeenNthCalledWith(1, 20, 40);
    expect(pinceau.lineTo).toHaveBeenNthCalledWith(1, 300, 100);
    expect(pinceau.lineTo).toHaveBeenNthCalledWith(2, 320, 110);
    expect(onChangement).toHaveBeenCalledTimes(1);
    expect(onChangement).toHaveBeenCalledWith(true);
    expect(screen.getByText('Signature tracée.')).toBeInTheDocument();
  });

  it('capture le pointeur pour que le trait continue hors du cadre', () => {
    simulerCanvas();
    const { zone } = afficher();

    fireEvent.pointerDown(zone, { pointerId: 4, clientX: 10, clientY: 20 });

    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledWith(4);
  });

  it('laisse un point pour un simple appui', () => {
    const { pinceau } = simulerCanvas();
    const { zone } = afficher();

    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(zone, { pointerId: 1 });

    expect(pinceau.arc).toHaveBeenCalledWith(100, 100, 1.75, 0, 2 * Math.PI);
    expect(pinceau.fill).toHaveBeenCalledTimes(1);
  });

  it('ignore un deuxième doigt posé pendant le tracé', () => {
    const { pinceau } = simulerCanvas();
    const { zone } = afficher();

    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(zone, { pointerId: 2, clientX: 200, clientY: 80 });
    fireEvent.pointerMove(zone, { pointerId: 2, clientX: 210, clientY: 90 });
    fireEvent.pointerUp(zone, { pointerId: 2 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 20, clientY: 10 });

    expect(pinceau.arc).toHaveBeenCalledTimes(1);
    expect(pinceau.lineTo).toHaveBeenCalledTimes(1);
    expect(pinceau.lineTo).toHaveBeenCalledWith(40, 20);
  });

  it('termine le trait sur pointerup : un déplacement ensuite ne trace plus rien', () => {
    const { pinceau } = simulerCanvas();
    const { zone } = afficher();

    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(zone, { pointerId: 1 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 50, clientY: 50 });

    expect(pinceau.lineTo).not.toHaveBeenCalled();
  });

  it('accepte une signature en plusieurs traits, chacun avec son propre pointeur', () => {
    const { pinceau } = simulerCanvas();
    const { zone } = afficher();

    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 20, clientY: 10 });
    fireEvent.pointerUp(zone, { pointerId: 1 });
    fireEvent.pointerDown(zone, { pointerId: 2, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(zone, { pointerId: 2, clientX: 110, clientY: 60 });
    fireEvent.pointerUp(zone, { pointerId: 2 });

    expect(pinceau.arc).toHaveBeenCalledTimes(2);
    expect(pinceau.lineTo).toHaveBeenNthCalledWith(1, 40, 20);
    expect(pinceau.moveTo).toHaveBeenNthCalledWith(2, 200, 100);
    expect(pinceau.lineTo).toHaveBeenNthCalledWith(2, 220, 120);
  });

  it('termine le trait sur pointercancel (geste repris par le système)', () => {
    const { pinceau } = simulerCanvas();
    const { zone } = afficher();

    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(zone, { pointerId: 1 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 50, clientY: 50 });

    expect(pinceau.lineTo).not.toHaveBeenCalled();
  });

  it('« Effacer » vide le canvas et signale de nouveau une zone vide', async () => {
    const { pinceau } = simulerCanvas();
    const { zone, onChangement } = afficher();
    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(zone, { pointerId: 1 });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Effacer' }));

    expect(pinceau.clearRect).toHaveBeenCalledWith(0, 0, 600, 200);
    expect(onChangement).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('Zone vide.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeDisabled();
  });

  it('n’exporte l’image en PNG que lorsque la fenêtre la demande', () => {
    const { exporter } = simulerCanvas();
    const { zone, poignee } = afficher();
    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(zone, { pointerId: 1 });
    expect(exporter).not.toHaveBeenCalled();

    const image = poignee.current?.exporterPng();

    expect(image).toBe(IMAGE);
    expect(exporter).toHaveBeenCalledWith('image/png');
  });

  it('ne trace rien pendant l’envoi', () => {
    const { pinceau } = simulerCanvas();
    const { zone, onChangement } = afficher(true);

    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 10, clientY: 10 });

    expect(pinceau.arc).not.toHaveBeenCalled();
    expect(onChangement).not.toHaveBeenCalled();
  });
});
