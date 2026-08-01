import type { Metadata } from 'next';
import './talos.css';
import { PRODUCT_NAME } from '@crown/contracts';

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s - ${PRODUCT_NAME}` },
  description:
    'Pertahanan ransomware otonom kelas perbankan: deteksi multi-sinyal, containment bergerbang dial, audit hash-chained yang tidak bisa diubah.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
