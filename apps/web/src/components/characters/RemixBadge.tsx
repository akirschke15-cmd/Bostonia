'use client';

import Link from 'next/link';
import { GitFork } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

interface ParentCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
  creator: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

interface RemixBadgeProps {
  parentCharacter: ParentCharacter;
  variant?: 'default' | 'compact' | 'full';
  className?: string;
}

export function RemixBadge({
  parentCharacter,
  variant = 'default',
  className,
}: RemixBadgeProps) {
  if (variant === 'compact') {
    return (
      <Link
        href={`/characters/${parentCharacter.id}`}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-full',
          'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20',
          'text-xs font-medium transition-colors',
          className
        )}
      >
        <GitFork className="h-3 w-3" />
        <span>Remix</span>
      </Link>
    );
  }

  if (variant === 'full') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg',
          'bg-gradient-to-r from-purple-500/10 to-pink-500/10',
          'border border-purple-500/20',
          className
        )}
      >
        <GitFork className="h-5 w-5 text-purple-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">Remixed from</p>
          <Link
            href={`/characters/${parentCharacter.id}`}
            className="flex items-center gap-2 mt-1 group"
          >
            {parentCharacter.avatarUrl ? (
              <img
                src={parentCharacter.avatarUrl}
                alt={parentCharacter.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                {getInitials(parentCharacter.name)}
              </div>
            )}
            <div>
              <p className="font-medium group-hover:text-purple-400 transition-colors">
                {parentCharacter.name}
              </p>
              <p className="text-xs text-muted-foreground">
                by @{parentCharacter.creator.username}
              </p>
            </div>
          </Link>
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <Link
      href={`/characters/${parentCharacter.id}`}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg',
        'bg-purple-500/10 hover:bg-purple-500/20 transition-colors',
        'text-sm',
        className
      )}
    >
      <GitFork className="h-4 w-4 text-purple-400" />
      <span className="text-muted-foreground">Remix of</span>
      <span className="font-medium text-purple-400">{parentCharacter.name}</span>
    </Link>
  );
}
