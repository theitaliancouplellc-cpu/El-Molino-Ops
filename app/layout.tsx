import type { Metadata, Viewport } from 'next';
import './globals.css';
import './extra.css';
import './command.css';
import PWARegister from './pwa-register';
import GlobalActions from './global-actions';
import ErrorSanitizer from './error-sanitizer';
import AskAgentBridge from './ask-agent-bridge';

export const metadata: Metadata = {
  title: { default: 'El Molino Ops', template: '%s · El Molino Ops' },
  description: 'Private Johns Island operations workspace',
  applicationName: 'El Molino Ops',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: {
    capable: true,
    title: 'El Molino Ops',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: true, email: true, address: true },
};

export const viewport: Viewport = {
  themeColor: '#173d2a',
  colorScheme: 'light dark',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PWARegister />
        <ErrorSanitizer />
        <GlobalActions />
        <AskAgentBridge />
        {children}
      </body>
    </html>
  );
}
