import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { trackVisualViewport } from './lib/viewport';
import { StoreProvider } from './state/store';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './styles/index.css';

trackVisualViewport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </StoreProvider>
  </StrictMode>,
);
