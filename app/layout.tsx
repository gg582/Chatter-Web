import type { Metadata } from 'next';
import './globals.css';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { resolveChatterRuntimeConfig } from '../src/utils/config'; // Import the new function

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
  weight: ['400', '500', '600']
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ibm-plex-mono',
  weight: ['400', '600', '700']
});

export const metadata: Metadata = {
  title: 'Chatter BBS Bridge',
  description: 'A pastel lounge with a focused terminal bridge for Chatter BBS.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const chatterConfig = resolveChatterRuntimeConfig();
  const serialisedConfig = JSON.stringify(chatterConfig).replace(/</g, '\\u003C');

  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__CHATTER_CONFIG__ = Object.freeze(${serialisedConfig});`
          }}
        />
      </body>
    </html>
  );
}
