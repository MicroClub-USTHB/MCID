import { DefaultReadersSettings } from '@/features/inbound-webhooks/components/default-readers-settings';
import { PageHeader } from '@/shared/components/layout/page-header';

export default function InboundWebhookSettingsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        eyebrow="System"
        title="Inbound webhook settings"
        description="The roles that can read the data of every new inbound webhook by default. They are granted when a webhook is created and can be removed there or later."
      />
      <DefaultReadersSettings />
    </div>
  );
}
