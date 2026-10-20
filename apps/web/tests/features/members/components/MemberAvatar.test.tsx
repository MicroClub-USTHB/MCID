import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemberAvatar } from '@/features/members/components/MemberAvatar';

/** jsdom never loads images; this stand-in loads or fails every `src` it is given. */
function stubImageLoading(outcome: 'load' | 'error') {
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    complete = false;
    naturalWidth = 0;
    referrerPolicy = '';
    crossOrigin: string | null = null;
    set src(_value: string) {
      queueMicrotask(() => {
        if (outcome === 'load') {
          this.complete = true;
          this.naturalWidth = 64;
          this.onload?.();
        } else {
          this.onerror?.();
        }
      });
    }
  }
  vi.stubGlobal('Image', StubImage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const URL = 'https://cdn.discordapp.com/avatars/123/a_animatedhash.gif?size=64';

describe('MemberAvatar', () => {
  it('renders animated Discord avatars once they load', async () => {
    stubImageLoading('load');
    render(<MemberAvatar displayName="Clubber Lang" avatarUrl={URL} avatarInitials="CL" />);

    const image = await screen.findByRole('img', { name: 'Clubber Lang avatar' });
    expect(image).toHaveAttribute('src', URL);
  });

  it('falls back to initials when the avatar fails to load', async () => {
    stubImageLoading('error');
    render(<MemberAvatar displayName="Clubber Lang" avatarUrl={URL} avatarInitials="CL" />);

    expect(await screen.findByText('CL')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders initials when no avatar URL is available', () => {
    render(<MemberAvatar displayName="Clubber Lang" avatarUrl={null} avatarInitials="CL" />);

    expect(screen.getByText('CL')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
