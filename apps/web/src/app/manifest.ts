import type { MetadataRoute } from 'next';

/** Install metadata: the MCID mark on the Primary dark background. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MCID, Micro Club Identity',
    short_name: 'MCID',
    description:
      'The identity platform of Micro Club: one Discord login for every club project, synced roles and members, and signed webhooks.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
