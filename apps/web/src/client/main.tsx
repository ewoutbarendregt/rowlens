import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { basePath } from './env.ts';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    {/* Trailing slash keeps <Link to="/"> on the canonical /projects/rowlens/ (the server 308s the bare path). */}
    <BrowserRouter basename={`${basePath}/`}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
