'use client';

import { useMemo } from 'react';

import { useAccessMatrixQuery, useProjectQuery } from '@/features/projects/api/queries';
import {
  useRevokeServerAccessMutation,
  useSetServerAccessMutation,
} from '@/features/projects/api/mutations';
import {
  AccessAuditLog,
  ServerAccessMatrix,
  type ServerAccessChange,
} from '@/features/projects/components';
import type { AccessMatrixEntry } from '@/features/projects/types';
import { useServersQuery } from '@/features/servers';
import { PageHeader } from '@/shared/components/layout/page-header';

/** Which servers a project may use, with which operations and scopes, and the history of those grants. */
export function ProjectAccessView({ projectId }: { projectId: string }) {
  const projectQuery = useProjectQuery(projectId);
  const matrixQuery = useAccessMatrixQuery(projectId);
  const { data: servers = [] } = useServersQuery();
  const setAccessMutation = useSetServerAccessMutation(projectId);
  const revokeAccessMutation = useRevokeServerAccessMutation(projectId);

  const accessMap = useMemo(() => {
    const map: Record<string, AccessMatrixEntry> = {};
    for (const entry of matrixQuery.data ?? []) {
      map[entry.serverId] = entry;
    }
    return map;
  }, [matrixQuery.data]);

  function handleChange(serverId: string, change: ServerAccessChange) {
    if (change.revoke) {
      revokeAccessMutation.mutate(serverId);
    } else if (change.operations) {
      setAccessMutation.mutate({
        serverId,
        payload: { operations: change.operations, scopes: change.scopes },
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Projects" title="Server access" description={projectQuery.data?.name} />

      <section
        aria-label="Server access by server"
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        <p className="paragraph-xs text-muted-foreground">
          Grant or revoke access per server and tune which operations and scopes are allowed.
        </p>
        <ServerAccessMatrix
          projectId={projectId}
          servers={servers}
          accessMap={accessMap}
          isMutating={setAccessMutation.isPending || revokeAccessMutation.isPending}
          onChange={handleChange}
        />
      </section>

      <section
        aria-labelledby="audit-heading"
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex flex-col gap-1">
          <h2 id="audit-heading" className="paragraph-md font-semibold text-foreground">
            Access audit log
          </h2>
          <p className="paragraph-xs text-muted-foreground">
            Every grant, update, and revocation for this project.
          </p>
        </div>
        <AccessAuditLog projectId={projectId} />
      </section>
    </div>
  );
}
