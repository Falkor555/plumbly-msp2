import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('incrémente le compteur à chaque clic sur le bouton', async () => {
    const utilisateur = userEvent.setup();
    render(<App />);
    const bouton = screen.getByRole('button', { name: /count is/i });

    await utilisateur.click(bouton);
    await utilisateur.click(bouton);

    expect(bouton).toHaveTextContent('Count is 2');
  });
});
