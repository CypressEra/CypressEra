import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import './i18n'; // Initialize i18n
import { DialogProvider } from './components/common';
import { AuthProvider } from './auth';
import { WebSocketProvider } from './contexts/WebSocketContext';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  // <React.StrictMode>
    <DialogProvider>
      <AuthProvider apiBaseURL={(window as any).API_BASE_URL || 'http://localhost:8080'}>
        <WebSocketProvider>
          <App />
        </WebSocketProvider>
      </AuthProvider>
    </DialogProvider>
  // </React.StrictMode>
);

// This app ships no service worker. Older builds (or the host) may have left
// one registered in the browser, which surfaces as a "no-op fetch handler"
// warning and can serve stale assets. Proactively unregister any that exist.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => registrations.forEach((r) => r.unregister()))
    .catch(() => { /* nothing to clean up */ });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
