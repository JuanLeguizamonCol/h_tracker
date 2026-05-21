import { PublicClientApplication, Configuration } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? 'b44bcf9e-cc38-4542-82b9-e9447a45a7ec',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID ?? '9a347a67-e3c3-4de7-9c88-449af6f6c092'}`,
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI ?? window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: [
    import.meta.env.VITE_AZURE_API_SCOPE ?? 'api://6cda0fcc-09b3-4173-b6cc-07df8bf2b82b/user_impersonation',
  ],
};
