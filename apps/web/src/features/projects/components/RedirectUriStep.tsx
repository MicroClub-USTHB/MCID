'use client';

import { useState, type FormEvent } from 'react';

import { McButton } from '@/shared/components/ui/mc-button';
import { McInput } from '@/shared/components/ui/mc-input';

interface RedirectUriStepProps {
  projectId: string;
  isSubmitting?: boolean;
  submitLabel?: string;
  onSubmit: (redirectUri: string) => void;
  /** When set, the step can be skipped (API-key-only projects never use OAuth). */
  onSkip?: () => void;
}

function splitUris(value: string): string[] {
  return value
    .split(',')
    .map((uri) => uri.trim())
    .filter((uri) => uri.length > 0);
}

function isValidUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Step 2 of project creation. The backend only accepts the redirect URI via a
 * separate `PATCH /admin/projects/:id/redirect-uri` after the project exists,
 * so this runs after step 1. A comma-separated list is stored as-is and must
 * match `GET /auth/authorize` values exactly. A project with no redirect URI
 * is valid: it just cannot use OAuth login (`/auth/authorize` refuses it).
 */
function RedirectUriStep({
  projectId,
  isSubmitting = false,
  submitLabel = 'Finish',
  onSubmit,
  onSkip,
}: RedirectUriStepProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const uris = splitUris(value);
    if (uris.length === 0) {
      setError('Enter at least one redirect URI');
      return;
    }
    const invalid = uris.find((uri) => !isValidUri(uri));
    if (invalid) {
      setError(`"${invalid}" is not a valid URL`);
      return;
    }
    setError(undefined);
    onSubmit(uris.join(', '));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <McInput
        id={`redirect-uri-${projectId}`}
        label="Redirect URI(s)"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
        description={
          <>
            Comma-separated for multiple values. The value used in{' '}
            <code className="font-mono text-foreground">/auth/authorize</code> must match one
            exactly.
          </>
        }
        placeholder="https://app.example.com/auth/callback, https://app.example.com/oauth2/callback"
        disabled={isSubmitting}
      />
      <div className="flex items-center justify-end gap-2">
        {onSkip && (
          <McButton
            type="button"
            variant="tertiary"
            size="md"
            disabled={isSubmitting}
            onClick={onSkip}
          >
            Skip for now
          </McButton>
        )}
        <McButton type="submit" size="md" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </McButton>
      </div>
    </form>
  );
}

export { RedirectUriStep, type RedirectUriStepProps };
