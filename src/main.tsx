import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/comic-neue/400.css';
import '@fontsource/comic-neue/700.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import App from './App';
import { applyDisplaySettings, getInitialDisplaySettings } from './displaySettings';
import './styles.css';

applyDisplaySettings(getInitialDisplaySettings());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
