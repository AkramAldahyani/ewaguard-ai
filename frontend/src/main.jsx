import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { captureSetupToken } from './features/setup/setup-link.js';
import './styles.css';

if (window.location.pathname === '/account-setup') {
  const token = captureSetupToken(window.location, window.history);
  // Load only the onboarding screen: no auth redirect, sockets, or app analytics.
  const { AccountSetupPage } = await import('./features/setup/AccountSetupPage.jsx');
  createRoot(document.getElementById('root')).render(<StrictMode><AccountSetupPage initialToken={token} /></StrictMode>);
} else {
  const { default: App } = await import('./App.jsx');
  createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
}
