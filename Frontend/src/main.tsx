import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// msal-browser v5's popup login redesign requires the redirect URI page itself
// to relay the auth response back to the opener window via BroadcastChannel
// (COOP-safe — no more opener-side polling of popup.location.href). Since our
// redirectUri is the app root, the popup fully loads this same entry point
// after Microsoft's login completes; without this call the popup never closes
// and the opener's loginPopup() promise hangs forever. On a normal page load
// (no auth response in the URL) this throws and we just render the app.
async function bootstrap() {
  try {
    const { broadcastResponseToMainFrame } = await import('@azure/msal-browser/redirect-bridge');
    await broadcastResponseToMainFrame();
    return; // This window was the MSAL popup/redirect response — it navigates or closes itself.
  } catch {
    // Not an MSAL auth response page — normal load, render the app.
  }
  createRoot(document.getElementById('root')!).render(<App />);
}

bootstrap();
