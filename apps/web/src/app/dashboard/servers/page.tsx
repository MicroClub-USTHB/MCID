import type { Metadata } from 'next';

import { ServersView } from './servers-view';
import { PageHeader } from '@/shared/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Servers',
};

export default function ServersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Discord"
        title="Servers"
        description="Manage the Discord servers MCID syncs and enforces permissions for."
      />
      <ServersView />
    </div>
  );
}
