import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELAI_DE_FRAPPE_MS, useValeurDifferee } from './useValeurDifferee';

/*
 * Seul test du dépôt à minuteurs factices : il ne passe ni par MSW ni par findBy, que ces
 * minuteurs bloqueraient.
 */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function monterAvec(valeurInitiale: string) {
  return renderHook(({ valeur }) => useValeurDifferee(valeur), {
    initialProps: { valeur: valeurInitiale },
  });
}

describe('valeur différée de la saisie', () => {
  it('US08 : rend d’emblée la valeur initiale, sans attendre le délai', () => {
    const { result } = monterAvec('');

    expect(result.current).toBe('');
  });

  it('US08 : garde l’ancienne valeur jusqu’à 300 ms, puis passe à la nouvelle', () => {
    const { result, rerender } = monterAvec('');

    rerender({ valeur: 'helene' });
    act(() => vi.advanceTimersByTime(DELAI_DE_FRAPPE_MS - 1));

    expect(DELAI_DE_FRAPPE_MS).toBe(300);
    expect(result.current).toBe('');

    act(() => vi.advanceTimersByTime(1));

    expect(result.current).toBe('helene');
  });

  it('US08 : relance le délai à chaque frappe et ne rend que la dernière saisie', () => {
    const { result, rerender } = monterAvec('');

    rerender({ valeur: 'h' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ valeur: 'he' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ valeur: 'hel' });
    act(() => vi.advanceTimersByTime(200));

    expect(result.current).toBe('');

    act(() => vi.advanceTimersByTime(100));

    expect(result.current).toBe('hel');
  });

  it('US08 : respecte un délai donné en paramètre', () => {
    const { result, rerender } = renderHook(({ valeur }) => useValeurDifferee(valeur, 50), {
      initialProps: { valeur: 1 },
    });

    rerender({ valeur: 2 });
    act(() => vi.advanceTimersByTime(49));

    expect(result.current).toBe(1);

    act(() => vi.advanceTimersByTime(1));

    expect(result.current).toBe(2);
  });

  it('US08 : annule le minuteur en cours au démontage', () => {
    const { rerender, unmount } = monterAvec('');
    rerender({ valeur: 'helene' });

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
