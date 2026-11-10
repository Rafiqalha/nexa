import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root tidak ditemukan');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
