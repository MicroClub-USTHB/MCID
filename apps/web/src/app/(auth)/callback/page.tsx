import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AuthCallbackHandler } from '@/features/auth/components/AuthCallbackHandler';
import { AuthMark, AuthShell } from '@/features/auth/components/AuthShell';

export const metadata: Metadata = {
  title: 'Signing in',
};

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <AuthShell role="status" aria-label="Loading" className="items-center">
          <AuthMark className="motion-safe:animate-pulse" />
        </AuthShell>
      }
    >
      <AuthCallbackHandler />
    </Suspense>
  );
}
