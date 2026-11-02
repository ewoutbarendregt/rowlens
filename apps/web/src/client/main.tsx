import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { basePath } from './env.ts';
import { applyLanguage } from './i18n/language.ts';
import { applyTheme, savedTheme } from './ui/theme.ts';
// Classical (ADR-0014): self-hosted fonts, the system's stylesheet, then RowLens's theme and styles.
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import '@fontsource/lora/600.css';
import './design/classical.css';
import './design/theme.css';
import './styles.css';

// Before the first render, so a dark choice doesn't flash light first.
applyTheme(savedTheme());
applyLanguage();

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
