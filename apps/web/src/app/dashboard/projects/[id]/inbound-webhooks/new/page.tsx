import { CreateWebhookForm } from '@/features/inbound-webhooks/components/create-webhook-form';
import { PageHeader } from '@/shared/components/layout/page-header';

export default async function NewInboundWebhookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Projects"
        title="New inbound webhook"
        description="Describe what the caller sends, choose who can read it, and you get a signing secret to give to the caller. One webhook describes one form or one kind of event."
      />
      <CreateWebhookForm projectId={id} />
    </div>
  );
}
