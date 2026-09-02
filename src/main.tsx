import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/comic-neue/400.css';
import '@fontsource/comic-neue/700.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import App from './App';
import { applyDisplaySettings, applyNetworkTint, getInitialDisplaySettings } from './displaySettings';
import './styles.css';

applyDisplaySettings(getInitialDisplaySettings());
// Qortium tint before first paint; App re-resolves it per open conversation.
applyNetworkTint('qortium');

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
