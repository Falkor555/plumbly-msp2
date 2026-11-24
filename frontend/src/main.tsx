import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

async function demarrer(): Promise<void> {
  // npm run dev:simule. import.meta.env.DEV : en production, le code de simulation est retiré du bundle.
  if (import.meta.env.DEV && import.meta.env.MODE === 'simulation') {
    const { demarrerSimulation } = await import('./simulation/demarrerSimulation');
    await demarrerSimulation();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void demarrer();
