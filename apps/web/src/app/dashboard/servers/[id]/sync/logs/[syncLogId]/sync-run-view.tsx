'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { SYNC_CHANGES_PAGE_SIZE, useSyncChangesQuery } from '@/features/sync/api/queries';
import { SyncChangeDetail } from '@/features/sync/components';
import { McButton } from '@/shared/components/ui/mc-button';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { McAlert } from '@/shared/components/ui/mc-alert';
import { PageHeader } from '@/shared/components/layout/page-header';

/** Entity-level changes of one sync run. `backHref` is where "Back to sync" leads. */
export function SyncRunView({ syncLogId: raw, backHref }: { syncLogId: string; backHref: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const syncLogId = Number(raw);
  const isValidId = Number.isInteger(syncLogId) && syncLogId > 0;

  const error = searchParams.get('error');
  const [page, setPage] = useState(1);
  const changesQuery = useSyncChangesQuery(isValidId ? syncLogId : null, page);
  const changes = changesQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <McButton
          variant="secondary"
          icon="leading"
          iconDefinition={<ArrowLeft aria-hidden="true" />}
          onClick={() => router.push(backHref)}
        >
          Back to sync
        </McButton>
      </div>

      {!isValidId ? (
        <EmptyState title="Sync run not found" description="That sync run reference isn’t valid." />
      ) : (
        <>
          <PageHeader
            eyebrow="Discord"
            title={`Sync run #${syncLogId}`}
            description="Every entity-level change recorded during this sync operation."
          />

          {error && (
            <McAlert
              variant="destructive"
              title="This sync failed"
              description={error}
              className="w-full max-w-none"
            />
          )}

          <SyncChangeDetail
            changes={changes?.data ?? []}
            isLoading={changesQuery.isPending}
            isError={changesQuery.isError}
            onRetry={() => void changesQuery.refetch()}
            page={changes?.page ?? page}
            pageSize={changes?.pageSize ?? SYNC_CHANGES_PAGE_SIZE}
            total={changes?.total ?? 0}
            totalPages={changes?.totalPages ?? 1}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
