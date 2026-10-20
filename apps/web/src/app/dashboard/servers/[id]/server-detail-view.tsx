'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Server as ServerIcon } from 'lucide-react';

import { Can } from '@/shared/components/common';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { McAlert } from '@/shared/components/ui/mc-alert';
import { McButton, buttonVariants } from '@/shared/components/ui/mc-button';
import { McSkeleton } from '@/shared/components/ui/mc-skeleton';
import { showToast } from '@/shared/stores';
import type { ApiError } from '@/shared/types';
import {
  DeleteServerModal,
  DisableServerModal,
  ServerAvatar,
  ServerForm,
  ServerStatsCard,
  ServerStatusBadge,
  ServerTypeBadge,
  useDeleteServerMutation,
  useDisableServerMutation,
  useEnableServerMutation,
  useServerQuery,
  useUpdateServerMutation,
} from '@/features/servers';
import { useServerStatsQuery } from '@/features/stats';
import { PageHeader } from '@/shared/components/layout/page-header';

interface ServerDetailViewProps {
  id: string;
}

function ServerDetailView({ id }: ServerDetailViewProps) {
  const router = useRouter();

  const { data: server, isPending, isError, error, refetch } = useServerQuery(id);
  const { data: serverStats, isPending: isStatsPending } = useServerStatsQuery();
  const stats = serverStats?.servers.find((entry) => entry.serverId === id);

  const [disableOpen, setDisableOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const updateMutation = useUpdateServerMutation();
  const disableMutation = useDisableServerMutation();
  const enableMutation = useEnableServerMutation();
  const deleteMutation = useDeleteServerMutation();

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <McSkeleton rectangle className="size-14 rounded-lg" />
          <div className="flex flex-col gap-2">
            <McSkeleton rectangle className="h-6 w-40" />
            <McSkeleton rectangle className="h-4 w-24" />
          </div>
        </div>
        <Can resource="stats" level="read">
          <ServerStatsCard stats={undefined} isLoading />
        </Can>
        <McSkeleton rectangle className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    const apiError = error as unknown as ApiError;

    if (apiError.status === 404) {
      return (
        <EmptyState
          icon={<ServerIcon className="size-8" />}
          title="Server not found"
          description="This server may have been deleted or the link is incorrect."
          action={
            <Link
              href="/dashboard/servers"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Back to servers
            </Link>
          }
        />
      );
    }

    return (
      <div className="flex flex-col items-start gap-3">
        <McAlert
          variant="destructive"
          title="Couldn’t load this server"
          description={apiError.message || 'Failed to load server.'}
          className="w-full max-w-none"
        />
        <McButton type="button" variant="secondary" size="sm" onClick={() => void refetch()}>
          Retry
        </McButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Discord"
        title={server.name}
        leading={<ServerAvatar name={server.name} icon={server.icon} size="lg" />}
        actions={
          <>
            <Can resource="servers" level="write">
              <McButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={server.isMain}
                onClick={() => {
                  if (server.isActive) {
                    setDisableOpen(true);
                  } else {
                    enableMutation.mutate(server.id, {
                      onSuccess: () => showToast(`${server.name} enabled`, 'success'),
                      onError: (mutationError) =>
                        showToast(mutationError.message || 'Failed to enable server', 'error'),
                    });
                  }
                }}
              >
                {server.isActive ? 'Disable' : 'Enable'}
              </McButton>
            </Can>
            <Can resource="servers" level="manage">
              <McButton
                type="button"
                variant="primary"
                destructive
                size="sm"
                disabled={server.isMain}
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </McButton>
            </Can>
          </>
        }
      >
        <div className="flex items-center gap-2">
          <ServerStatusBadge isActive={server.isActive} isMain={server.isMain} />
          <ServerTypeBadge type={server.type} />
        </div>
        {server.isMain ? (
          <p className="paragraph-xs text-muted-foreground">
            The main server cannot be disabled or deleted.
          </p>
        ) : null}
      </PageHeader>

      <Can resource="stats" level="read">
        <ServerStatsCard stats={stats} isLoading={isStatsPending} />
      </Can>

      <ServerForm
        mode="edit"
        server={server}
        isSubmitting={updateMutation.isPending}
        onSubmit={(payload) =>
          updateMutation.mutate(
            { id: server.id, payload },
            {
              onSuccess: () => showToast('Server updated', 'success'),
              onError: (mutationError) =>
                showToast(mutationError.message || 'Failed to update server', 'error'),
            }
          )
        }
      />

      <DisableServerModal
        open={disableOpen}
        onOpenChange={setDisableOpen}
        serverName={server.name}
        isSubmitting={disableMutation.isPending}
        onConfirm={(reason) =>
          disableMutation.mutate(
            { id: server.id, payload: { disabledReason: reason } },
            {
              onSuccess: () => {
                showToast(`${server.name} disabled`, 'success');
                setDisableOpen(false);
              },
              onError: (mutationError) =>
                showToast(mutationError.message || 'Failed to disable server', 'error'),
            }
          )
        }
      />

      <DeleteServerModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        serverName={server.name}
        isSubmitting={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate(server.id, {
            onSuccess: () => {
              showToast(`${server.name} deleted`, 'success');
              router.push('/dashboard/servers');
            },
            onError: (mutationError) =>
              showToast(mutationError.message || 'Failed to delete server', 'error'),
          })
        }
      />
    </div>
  );
}

export { ServerDetailView };
