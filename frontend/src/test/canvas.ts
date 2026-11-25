import { vi } from 'vitest';

/*
 * jsdom n'a ni canvas ni capture du pointeur : le contexte 2D, l'export PNG et le cadre affiché
 * sont simulés. Le cadre fait 300 × 100 px : un point de l'écran vaut le double dans le canvas.
 */

/** Plus petite data URL utile aux tests : l'en-tête d'un PNG. */
export const IMAGE_PNG_DE_TEST = 'data:image/png;base64,iVBORw0KGgo=';

export function simulerCanvas(image = IMAGE_PNG_DE_TEST) {
  const pinceau = {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    pinceau as unknown as CanvasRenderingContext2D,
  );
  const exporter = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(image);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 300,
    height: 100,
  } as DOMRect);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    value: vi.fn(),
    configurable: true,
  });
  return { pinceau, exporter };
}
