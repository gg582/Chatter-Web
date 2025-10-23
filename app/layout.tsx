import type { Metadata } from 'next';
import './globals.css';
import { ChatterProvider } from '../context/ChatterContext';

export const metadata: Metadata = {
  title: 'Chatter BBS Web',
  description: 'A modern web interface for the Chatter CLI BBS experience'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ChatterProvider>{children}</ChatterProvider>
      </body>
    </html>
  );
}
