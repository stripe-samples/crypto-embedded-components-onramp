import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App';
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from './constants';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

if (!PRIVY_APP_ID) {
  throw new Error('VITE_PRIVY_APP_ID is not set in web/.env');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
      config={{
        loginMethods: ['email'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'off' },
        },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>,
);
