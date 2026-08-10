import { PublicClientApplication, Configuration } from '@azure/msal-browser';

const clientId = typeof window !== 'undefined' ? window.__ENV__?.ENTRA_CLIENT_ID : undefined;
const tenantId = typeof window !== 'undefined' ? window.__ENV__?.ENTRA_TENANT_ID : undefined;

// Microsoft sign-in only shows up when both are configured (e.g. not in local
// dev unless explicitly set) — see Frontend/public/config.js.
export const isEntraConfigured = Boolean(clientId && tenantId);

const msalConfig: Configuration = {
  auth: {
    clientId: clientId || '',
    authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

// msal-browser v3+ requires an async initialize() before any other call.
// Cached so repeated logins don't re-initialize.
let initPromise: Promise<void> | null = null;
export function ensureMsalInitialized(): Promise<void> {
  if (!initPromise) initPromise = msalInstance.initialize();
  return initPromise;
}
