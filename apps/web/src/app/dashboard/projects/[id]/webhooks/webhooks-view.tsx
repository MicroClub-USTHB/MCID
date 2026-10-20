'use client';

import { useState } from 'react';
import { AlertCircle, Webhook } from 'lucide-react';

import { useWebhooksQuery } from '@/features/webhooks/api/queries';
import { WebhookDetail, WebhookTable } from '@/features/webhooks/components';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';

/** Webhooks of the project in the URL; the sidebar's project switcher picks the project. */
export function WebhooksView({ projectId }: { projectId: string }) {
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  const webhooksQuery = useWebhooksQuery(projectId);
  const webhooks = webhooksQuery.data?.webhooks ?? [];

  const activeWebhook =
    webhooks.find((webhook) => webhook.id === selectedWebhookId) ?? webhooks[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Projects"
        title="Webhooks"
        description="Review the Discord webhooks this project owns, how much they’re used, and remove the ones that shouldn’t exist."
      />

      {webhooksQuery.isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn’t load webhooks"
          description="This project’s webhooks could not be retrieved right now."
          actionLabel="Retry"
          onAction={() => void webhooksQuery.refetch()}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <WebhookTable
            webhooks={webhooks}
            selectedId={activeWebhook?.id ?? null}
            onSelect={setSelectedWebhookId}
            isLoading={webhooksQuery.isPending}
            emptyState={
              <EmptyState
                icon={Webhook}
                title="No webhooks"
                description="Webhooks are created by the project with its own API key. Any it creates will show up here."
                className="rounded-none border-0"
              />
            }
          />

          {activeWebhook ? (
            <WebhookDetail
              key={activeWebhook.id}
              webhook={activeWebhook}
              onDeleted={() => setSelectedWebhookId(null)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
