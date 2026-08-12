import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'El Molino Ops',
  description: 'Johns Island restaurant operations workspace',
  appleWebApp: {
    capable: true,
    title: 'El Molino Ops',
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
