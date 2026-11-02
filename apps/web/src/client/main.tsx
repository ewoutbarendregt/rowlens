import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { basePath } from './env.ts';
import { applyTheme, savedTheme } from './ui/theme.ts';
import './design/fonts.css';
import './design/tokens.css';
import './styles.css';

// Before the first render, so a dark choice doesn't flash light first.
applyTheme(savedTheme());

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
