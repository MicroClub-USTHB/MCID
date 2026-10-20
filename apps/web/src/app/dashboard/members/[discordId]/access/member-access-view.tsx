'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { MemberAccessEditor } from '@/features/access/components/MemberAccessEditor';
import { buttonVariants } from '@/shared/components/ui/mc-button';
import { cn } from '@/shared/lib/utils';
import { PageHeader } from '@/shared/components/layout/page-header';

/** One member's access levels and overrides. Root only, and independent of the member detail page. */
export function MemberAccessView({ memberId }: { memberId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <Link
          href="/dashboard/access"
          className={cn(buttonVariants({ variant: 'tertiary', size: 'sm' }), '-ml-2 w-fit gap-2')}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Access
        </Link>
        <PageHeader
          className="mt-2"
          eyebrow="System"
          title="Member access"
          description="What this person can do, and where it comes from. An override replaces what their roles grant for that area, for this person only."
        />
      </div>
      <MemberAccessEditor memberId={memberId} />
    </div>
  );
}
