import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { CutListProvider } from './state/cutListContext.js';
import './styles/style.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemento #root não encontrado.');
}

createRoot(container).render(
  <StrictMode>
    <CutListProvider>
      <App />
    </CutListProvider>
  </StrictMode>,
);
