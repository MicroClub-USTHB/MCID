'use client';

import { McAvatar, McAvatarFallback, McAvatarImage } from '@/shared/components/ui/mc-avatar';
import { cn } from '@/shared/lib/utils';

interface MemberAvatarProps {
  displayName: string;
  avatarUrl: string | null;
  avatarInitials: string;
  sizeClassName?: string;
  textSizeClassName?: string;
  className?: string;
}

/** A member's Discord avatar on the mcoli-ui avatar, with their initials while it loads or fails. */
export function MemberAvatar({
  displayName,
  avatarUrl,
  avatarInitials,
  sizeClassName = 'size-10',
  textSizeClassName = 'text-sm',
  className,
}: MemberAvatarProps) {
  return (
    <McAvatar className={cn(sizeClassName, className)}>
      {avatarUrl ? (
        <McAvatarImage
          key={avatarUrl}
          src={avatarUrl}
          alt={`${displayName} avatar`}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <McAvatarFallback
        className={cn('bg-primary font-semibold text-primary-foreground', textSizeClassName)}
      >
        {avatarInitials}
      </McAvatarFallback>
    </McAvatar>
  );
}
