import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { applyTokens } from './design/applyTokens';
import './design/global.css';
import './design/components.css';

applyTokens(); // the mobile theme's tokens become CSS variables before first paint
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
