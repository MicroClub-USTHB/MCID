import type { Metadata } from 'next';
import { Eye } from 'lucide-react';

import { AuthMark, AuthShell } from '@/features/auth/components/AuthShell';
import { DiscordLoginButton } from '@/features/auth/components/DiscordLoginButton';
import { getSafeRedirectPath } from '@/features/auth/lib/safe-redirect';

export const metadata: Metadata = {
  title: 'Login',
};

/**
 * The post-login destination is read from `searchParams` on the server rather
 * than with `useSearchParams` on the client. That keeps this a Server
 * Component, so it can still export `metadata`, and avoids the Suspense
 * boundary a statically-rendered page would otherwise be required to wrap the
 * hook in. Bouncing an already-authenticated admin away from this page is
 * handled in `proxy.ts`, where it happens before any HTML is sent
 * instead of as a post-hydration flash.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const { redirect } = await searchParams;
  const redirectPath = getSafeRedirectPath(typeof redirect === 'string' ? redirect : undefined);

  return (
    <AuthShell>
      <div className="mb-8 flex flex-col items-center gap-5 text-center">
        <AuthMark />
        <div className="space-y-2">
          <h1 id="login-title" className="header-xs font-bold text-foreground">
            Sign in to MCID
          </h1>
          <p className="paragraph-sm text-pretty text-muted-foreground">
            Micro Club admins sign in with their Discord account.
          </p>
        </div>
      </div>
      <DiscordLoginButton size="lg" redirectPath={redirectPath} className="w-full" />
      <p className="mt-6 flex items-start gap-2 border-t border-border pt-5 text-left text-xs leading-5 text-muted-foreground">
        <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          MCID reads your Discord profile, email, servers and roles to decide what you can open. It
          never posts on your behalf.
        </span>
      </p>
    </AuthShell>
  );
}
