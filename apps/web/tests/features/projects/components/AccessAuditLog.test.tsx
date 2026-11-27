import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AccessAuditLog } from '@/features/projects/components';
import type { AccessAuditEntry } from '@/features/projects/types';

vi.mock('@/features/projects/api/queries', () => ({
  useAccessAuditQuery: () => ({ data: undefined, isPending: false }),
}));

const entry = (overrides: Partial<AccessAuditEntry> = {}): AccessAuditEntry => ({
  id: 1,
  projectId: 'proj-1',
  serverId: '1282095800079351851',
  action: 'GRANT',
  operationsBefore: null,
  operationsAfter: { READ: true, SEND_MESSAGES: false, MANAGE_WEBHOOKS: false },
  changedBy: '800000000000000001',
  changedByUsername: 'testadmin',
  changedAt: '2026-11-27T10:00:00.000Z',
  ...overrides,
});

describe('AccessAuditLog', () => {
  it('shows the admin who made the change as @username', () => {
    render(<AccessAuditLog projectId="proj-1" entries={[entry()]} isLoading={false} />);

    expect(screen.getByText(/by @testadmin/)).toBeInTheDocument();
  });

  it('falls back to the stored actor when no member matches', () => {
    render(
      <AccessAuditLog
        projectId="proj-1"
        entries={[entry({ changedBy: 'unknown-admin', changedByUsername: null })]}
        isLoading={false}
      />
    );

    expect(screen.getByText(/by unknown-admin/)).toBeInTheDocument();
  });
});
