
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installNativeKioskShim } from './services/nativeBootstrap';

// On Android (Capacitor) this installs the window.kiosk shim so the app's existing
// backend code paths work. No-op in Electron/web (where window.kiosk already exists or
// the web fallback is used).
installNativeKioskShim();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
