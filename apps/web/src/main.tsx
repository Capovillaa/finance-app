import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
// Self-hosted rather than the Google Fonts CDN, so the app has no third-party
// request on its critical path and renders the same offline.
//
// Fraunces ships one file per axis set: `opsz.css` carries weight *and* optical
// size, which is the axis that matters here — a balance set at `opsz 96` has
// the stroke contrast of a headline, while the default `opsz 14` would look
// like body copy blown up.
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/instrument-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import App from './App';
import { store } from './app/store';
import { ToastProvider } from './components/Toast';
import { restoreSession } from './features/auth/sessionBootstrap';
// Imported for its side effect: i18next has to be initialised before the first
// component calls `useTranslation`, and before `lib/format.ts` asks it which
// locale to format dates and money in.
import './i18n';
import { theme } from './theme';

// Kicked off before the first render so the silent refresh is already in flight
// while React mounts, rather than starting after it.
void store.dispatch(restoreSession());

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline enableColorScheme />
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </Provider>
  </StrictMode>,
);
